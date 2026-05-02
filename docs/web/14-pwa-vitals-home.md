# web/14 · PWA Vitals-First Home Screen

## Feature scope

The new home screen of the PWA. When a rider opens the app, they see live vitals first (band connection, HR, signal quality), then choose what activity is happening. The rider's mental model: "show me what's going on with the horse, then I'll tell you what we're doing."

## Depends on

- `web/01-pwa-onboarding.md` (rider must be logged in)
- `web/03-pwa-band-pairing.md` (BLE connection)
- `web/12-realtime-channels.md` (live HR push)

## Replaces

The previous flow in `web/02-pwa-session-flow.md` step 1 (activity-type-first picker). The session flow becomes:
1. Vitals-first home (this spec)
2. → Activity picker (manual, 7 types)
3. → Horse picker
4. → Recording screen
5. → Review screen

## Public interface

| Route | Component | Purpose |
|---|---|---|
| `/home` | `VitalsHome` | Live vitals + activity picker entry |
| `/start/activity` | `ActivityPicker` | Pick from 7 activity types |
| `/start/horse` | `HorsePicker` | Pick horse |
| `/session/[id]` | `RecordingScreen` (existing) | Live recording |

## The 7 activity types

| Code | Display label | Icon | Sub-types |
|---|---|---|---|
| `riding` | Riding session | 🏇 | walk / trot / canter / jump (auto-detected) |
| `grass_field` | Grass field | 🌳 | none — single block |
| `walker` | Horse walker | 🔄 | none |
| `stall` | Stall rest | 🏠 | none |
| `transport` | Transport | 🚛 | none |
| `vet` | Vet / treatment | 🩺 | none + free-text note |
| `other` | Other | ➕ | free-text description |

This list lives in `lib/activities.ts` as a single typed constant. Used by PWA, admin, API validation, and database CHECK constraint.

## Files

```
app/(rider)/home/page.tsx                       ← ≤ 130 lines (replaces existing)
app/(rider)/start/activity/page.tsx             ← ≤ 100 lines
app/(rider)/start/horse/page.tsx                ← already specced in 02
components/home/VitalsCard.tsx                  ← ≤ 130 lines
components/home/BandStatusBar.tsx               ← ≤ 80 lines
components/home/SignalQualityIndicator.tsx      ← ≤ 60 lines
components/activity/ActivityCard.tsx            ← ≤ 60 lines
lib/activities.ts                                ← ≤ 80 lines
lib/ble/passive-stream.ts                        ← ≤ 100 lines
tests/e2e/vitals-home.spec.ts
```

## Vitals-first home screen design

```
┌─────────────────────────────────────────┐
│  [LF] La Fattoria              ⚙        │
│  Hi, Anna 👋                            │
├─────────────────────────────────────────┤
│                                         │
│  Hippo                                  │
│  ┌─────────────────────────────────┐    │
│  │  ❤ 87 bpm           ▮▮▮▮▮       │    │
│  │  HR              signal: good   │    │
│  │                                 │    │
│  │  R-R   690 ms                   │    │
│  │  Battery 92%    Band 1          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [ Connect band ] (if not connected)    │
│                                         │
│  ─────────────────────────────────      │
│                                         │
│  What is Hippo doing?                   │
│  ┌─────────────────────────────────┐    │
│  │  Pick activity → start recording│    │
│  └─────────────────────────────────┘    │
│                                         │
│  Recent sessions                        │
│  ─ Today 09:00  Riding   50 min  87/156 │
│  ─ Yesterday    Grass    2h 10m  54/89  │
│  ─ Yesterday    Stall    8h      32 avg │
│                                         │
└─────────────────────────────────────────┘
```

## States

The vitals card has three states:

### State 1 — No band connected

```
┌─────────────────────────────────┐
│  No band connected              │
│                                 │
│  ┌────────────────────────────┐ │
│  │   + Connect Polar H10       │ │
│  └────────────────────────────┘ │
│                                 │
│  Tip: Wet contact pads first    │
└─────────────────────────────────┘
```

Tap connect → triggers Web Bluetooth picker (per `web/03-pwa-band-pairing.md`).

### State 2 — Band connected, passive stream (no session active)

```
┌─────────────────────────────────┐
│  ❤ 87 bpm           ▮▮▮▮▮       │
│  HR              signal: good   │
│                                 │
│  R-R   690 ms                   │
│  Battery 92%    Band 1          │
└─────────────────────────────────┘
```

Vitals stream lives but **nothing is being recorded yet**. This is intentional — the rider sees the band working before committing to a session. Reduces "did it connect?" anxiety.

### State 3 — Recording in progress (after activity picked)

The vitals card stays visible but with a recording indicator:

```
┌─────────────────────────────────┐
│  ● Recording · 04:32            │
│  ❤ 87 bpm           ▮▮▮▮▮       │
│  HR              signal: good   │
│                                 │
│  Activity: Riding               │
│  Started 14:30                  │
└─────────────────────────────────┘
```

Tapping this card navigates to the recording screen (`/session/[id]`).

## Passive stream — important architectural note

When the band is connected but no session is active, samples are NOT inserted into the database. The PWA reads HR/R-R locally and displays them, but does not persist anything until the rider picks an activity and the session is created.

This avoids two problems:
1. Storage cost from idle "browsing" connection time
2. Confusion about which data belongs to which context

`lib/ble/passive-stream.ts` exposes a hook that subscribes to HR notifications without writing to the API:

```typescript
// lib/ble/passive-stream.ts

export function usePassiveBandStream(): {
  hr: number | null;
  rr: number | null;
  signal: 'good' | 'fair' | 'poor';
  battery: number | null;
  band_name: string | null;
  connected: boolean;
} {
  // Subscribe to HR characteristic only (no PMD streams during passive)
  // Update React state every time a notification arrives
  // Auto-reconnect on disconnect
}
```

Once the rider picks activity → horse → "Start," the recording screen takes over and starts the full PMD streams + ingest.

## Activity picker (manual)

After tapping "Pick activity → start recording":

```
┌─────────────────────────────────────────┐
│  ← Back                                 │
├─────────────────────────────────────────┤
│                                         │
│  What is Hippo doing?                   │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │ 🏇 Riding session              → │   │
│  │    walk / trot / canter / jump   │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ 🌳 Grass field                 → │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ 🔄 Horse walker                → │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ 🏠 Stall rest                  → │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ 🚛 Transport                   → │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ 🩺 Vet / treatment             → │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ ➕ Other                        → │   │
│  └──────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

Tap → for `vet` and `other`, prompt for free-text. Then proceed to horse picker, then to recording.

## Onboarding tip — first session

For a rider's first ever session, the home screen shows a one-time tip:

```
ⓘ How to use La Fattoria
1. Connect a Polar H10 band to the horse's chest
2. Watch live vitals to confirm the band is reading well
3. Pick the activity, pick the horse, start recording
4. Stop when done; we'll auto-detect gaits for riding sessions
```

Dismissed permanently after first dismiss.

## Live updates

Vitals card updates from the passive BLE stream every time a new HR notification arrives (~once per second from H10). React state, no polling, no API calls.

## Failure modes

| Situation | Behavior |
|---|---|
| Band disconnects mid-passive | Card switches to "No band connected" state with auto-reconnect attempt |
| Battery low (< 15%) | Yellow warning on battery indicator |
| Battery critical (< 5%) | Red warning, suggest charging before starting session |
| Signal poor (contact lost) | Signal indicator goes red, tip shown: "Wet the contact pads" |
| HR out of physiological range | Shown as-is; quality flag fires post-session |

## Integration test

```typescript
// tests/e2e/vitals-home.spec.ts

test('vitals appear when band connects', async ({ page, mockBLE }) => {
  await loginAs('test@lafattoria.dev', page);
  await page.goto('/home');
  
  await expect(page.getByText('No band connected')).toBeVisible();
  
  await mockBLE.advertiseDevice({ name: 'Polar H10 ABCD', services: ['heart_rate'] });
  await page.getByRole('button', { name: 'Connect Polar H10' }).click();
  await mockBLE.userSelectsDevice('Polar H10 ABCD');
  
  await mockBLE.simulateHRNotification({ hr: 87, rr: 690 });
  
  await expect(page.getByText('87 bpm')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/signal:/i)).toBeVisible();
});

test('passive stream does NOT create session', async ({ page, mockBLE, supabase }) => {
  await loginAs('test@lafattoria.dev', page);
  await page.goto('/home');
  await connectMockBand(page, mockBLE);
  
  // Stream for 10 seconds
  for (let i = 0; i < 10; i++) {
    await mockBLE.simulateHRNotification({ hr: 80 + i, rr: 700 });
    await page.waitForTimeout(1000);
  }
  
  const sessions = await supabase.from('sessions').select().eq('rider_id', testRiderId);
  expect(sessions.data).toHaveLength(0);  // no session created during passive
});
```

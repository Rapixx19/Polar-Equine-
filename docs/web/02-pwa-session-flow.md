# web/02 · PWA Session Flow

## Feature scope

The full session lifecycle from a logged-in rider's perspective: pick activity, pick horse, connect band, ride, end, review.

## Depends on

- `web/01-pwa-onboarding.md` (rider must be logged in)
- `web/03-pwa-band-pairing.md` (Web Bluetooth)
- `web/04-pwa-label-review.md` (post-session review)
- `web/10-api-sessions.md`

## Public interface

| Route | Component | Purpose |
|---|---|---|
| `/home` | `HomeScreen` | Activity-type picker |
| `/start/horse` | `HorsePicker` | Pick horse |
| `/start/band` | `BandPicker` | Pick band (or pair new) |
| `/start/ready` | `ReadyScreen` | Final confirmation |
| `/session/[id]` | `RecordingScreen` | Live session |
| `/session/[id]/review` | `ReviewScreen` | See `04-pwa-label-review.md` |

## Files in this feature

```
app/(rider)/home/page.tsx                 ← ≤ 100 lines
app/(rider)/start/horse/page.tsx          ← ≤ 100 lines
app/(rider)/start/band/page.tsx           ← ≤ 100 lines
app/(rider)/start/ready/page.tsx          ← ≤ 80 lines
app/(rider)/session/[id]/page.tsx         ← ≤ 130 lines
components/session/ActivityCard.tsx        ← ≤ 60 lines
components/session/HorseCard.tsx           ← ≤ 60 lines
components/session/LiveHRDisplay.tsx       ← ≤ 100 lines
components/session/SessionTimer.tsx        ← ≤ 60 lines
lib/session/state-machine.ts               ← ≤ 120 lines
tests/e2e/session-flow.spec.ts             ← Playwright
```

## Home screen

```
┌────────────────────────────────────────┐
│  [LF] La Fattoria                  ⚙   │
│  Hi, Anna 👋                           │
├────────────────────────────────────────┤
│                                        │
│  What's happening?                     │
│                                        │
│  ┌───────────────────────────────────┐ │
│  │ 🏇 Riding session                 │ │
│  │    Walk / trot / canter / jump    │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌───────────────────────────────────┐ │
│  │ 🌳 Field rest                     │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌───────────────────────────────────┐ │
│  │ 🔄 Walker                         │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌───────────────────────────────────┐ │
│  │ 🏠 Stall rest                     │ │
│  └───────────────────────────────────┘ │
│                                        │
│  Active sessions: none                 │
│  Recent: Hippo · today 14:30           │
│                                        │
└────────────────────────────────────────┘
```

If there's an active session by this rider, show a yellow banner at top: "You have an active session for Hippo. Resume?" with "Resume" and "End now" buttons.

## Horse picker

Lists horses the rider has permission for (via `horse_riders` table):

```
┌────────────────────────────────────────┐
│  ← Back        Riding session          │
├────────────────────────────────────────┤
│                                        │
│  Which horse?                          │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ [photo] Hippo                  → │  │
│  │         KWPN · 11y               │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ [photo] Venus                  → │  │
│  │         Holsteiner · 9y          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [ + Add a new horse ]                 │
│                                        │
└────────────────────────────────────────┘
```

Pre-selects rider's `preferred_horse_id` if set. Tap → goes to band picker.

## Band picker

Reads from local IndexedDB cache of paired bands + fetches active-band status:

```
┌────────────────────────────────────────┐
│  ← Back     Hippo · Riding             │
├────────────────────────────────────────┤
│                                        │
│  Which band?                           │
│                                        │
│  ✓ Band 1 (Polar H10)                  │
│    Available                          → │
│                                        │
│  ✗ Band 2 (Polar H10)                  │
│    With Venus (Steve, started 09:00)   │
│                                        │
│  [ + Pair a new band ]                 │
│                                        │
└────────────────────────────────────────┘
```

Tap available band → `Ready` screen. Tap "Pair new" → triggers Web Bluetooth picker (see `03-pwa-band-pairing.md`).

## Ready screen

```
┌────────────────────────────────────────┐
│  ← Back                                │
├────────────────────────────────────────┤
│                                        │
│  Anna · Hippo · Band 1                 │
│  Riding session                        │
│                                        │
│                                        │
│  1. Strap the band on Hippo's          │
│     girth area, electrodes against     │
│     the skin                           │
│                                        │
│  2. Wet the contact area lightly       │
│                                        │
│  3. Tap Start when ready               │
│                                        │
│                                        │
│  ┌────────────────────────────────┐    │
│  │             Start              │    │
│  └────────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘
```

Tap Start → POST `/api/sessions` → receive `session_id` → navigate to `/session/[id]`.

## Recording screen

```
┌────────────────────────────────────────┐
│  ●  Recording · 12:43                  │
├────────────────────────────────────────┤
│                                        │
│  Hippo · Band 1 · Anna                 │
│                                        │
│                                        │
│         98 bpm                         │
│         ━━━━━━━━━━━━━                  │
│         live trace                     │
│                                        │
│                                        │
│  Connection: ✓ Strong signal           │
│  Samples queued: 0                     │
│                                        │
│                                        │
│  ┌────────────────────────────────┐    │
│  │         End session            │    │
│  └────────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘
```

Behaviors:
- Wake Lock prevents screen sleep
- Service worker keeps PWA active if backgrounded
- Live HR via Supabase Realtime channel
- Banner if BLE drops: "⚠ Band signal lost — recording continues, attempting to reconnect"
- Banner if network drops: "⚠ Offline — buffering locally, will sync when reconnected"

Tap "End session" → confirmation modal → PATCH `/api/sessions/[id]` with action=end → navigate to review screen.

## State machine

```typescript
// lib/session/state-machine.ts

export type SessionState =
  | { kind: 'picking_activity' }
  | { kind: 'picking_horse'; activity: ActivityType }
  | { kind: 'picking_band'; activity: ActivityType; horse_id: string }
  | { kind: 'ready'; activity: ActivityType; horse_id: string; band_id: string }
  | { kind: 'recording'; session_id: string; band: PairedBand; started_at: Date }
  | { kind: 'ending'; session_id: string }
  | { kind: 'review'; session_id: string }
  | { kind: 'saved'; session_id: string };
```

State persists in IndexedDB so reloading the page recovers the session in progress.

## Edge cases

| Situation | Behavior |
|---|---|
| Rider closes PWA mid-session | State persists; on reopen, banner offers Resume / End |
| Network drops mid-session | IndexedDB buffer queues sample batches; replays on reconnect |
| BLE drops mid-session | Auto-reconnect attempts; recording continues; banner shown |
| Rider taps End by mistake | Confirmation modal "Are you sure?" — undo within 30s of confirm |
| Two devices try to start session for same horse with same band | Server returns 409 BAND_IN_USE; second device reroutes to band picker |
| Battery dies mid-session | Service worker checkpoints session every 30s; on reopen, prompt to resume from last checkpoint |
| Rider accidentally selects wrong horse | Admin can reattribute via dashboard; rider can also abort session and start fresh |

## Integration test

```typescript
// tests/e2e/session-flow.spec.ts

test('rider completes a riding session end-to-end', async ({ page, mockBLE }) => {
  await loginAs('test@lafattoria.dev', page);
  await page.goto('/home');

  await page.getByText('Riding session').click();
  await page.getByText('Hippo').click();
  await page.getByText('Band 1').click();
  
  // Mock BLE accepts the connection
  await mockBLE.simulatePolarH10Stream({ duration_s: 10 });
  
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('Recording')).toBeVisible();
  
  // Simulate 10 seconds of session
  await page.waitForTimeout(10_000);
  
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  
  await expect(page).toHaveURL(/\/session\/.+\/review/);
  await expect(page.getByText('Auto-detected')).toBeVisible();
});
```

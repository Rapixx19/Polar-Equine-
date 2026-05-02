# web/12 · Realtime Channels

## Feature scope

Use Supabase Realtime to push live updates to the PWA's recording screen and admin dashboard without polling.

## Channels

### `live-hr-{session_id}`

PWA's recording screen subscribes when a session is active. Broadcasts every new `samples_hr` insert for the session.

**Used by:**
- `app/(rider)/session/[id]/page.tsx` (Recording screen)

**Producer:** Postgres `samples_hr` table inserts.

### `active-sessions`

Admin "Today" screen subscribes. Broadcasts row-level events on `sessions` where `status = 'active'`.

**Used by:**
- `app/admin/page.tsx` (Today screen)

### `session-status-{session_id}`

PWA's review screen subscribes after session-end while waiting for algo. Broadcasts updates to `sessions.metrics_status` and `session_metrics` insertion.

## Files

```
lib/supabase/realtime.ts                  ← subscription helpers (≤ 100 lines)
components/realtime/LiveHRSubscriber.tsx   ← ≤ 80 lines
components/realtime/ActiveSessionsSub.tsx  ← ≤ 80 lines
tests/integration/realtime.test.ts
```

## Subscription helper

```typescript
// lib/supabase/realtime.ts

import { createBrowserClient } from './client';

export function subscribeLiveHR(
  session_id: string,
  onSample: (sample: HRSample) => void
): () => void {
  const supabase = createBrowserClient();
  const channel = supabase.channel(`live-hr-${session_id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'samples_hr',
        filter: `session_id=eq.${session_id}`,
      },
      (payload) => onSample(payload.new as HRSample)
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
```

## Recording screen usage

```tsx
'use client';
export function RecordingScreen({ session_id }) {
  const [latestHR, setLatestHR] = useState<number | null>(null);

  useEffect(() => {
    return subscribeLiveHR(session_id, (sample) => {
      setLatestHR(sample.hr_bpm);
    });
  }, [session_id]);

  return <LiveHRDisplay value={latestHR} />;
}
```

## RLS considerations

Realtime respects RLS. A rider only receives broadcasts for sessions they have access to. The filter on `session_id` is enforced server-side; clients can't subscribe to arbitrary sessions.

## Integration test

```typescript
test('live HR pushes to subscribed client', async () => {
  const session = await createTestSession();
  const received: HRSample[] = [];

  const unsubscribe = subscribeLiveHR(session.id, (s) => received.push(s));

  await waitForRealtimeReady();
  await insertHRSample(session.id, { hr_bpm: 87, rr_ms: 690 });

  await waitFor(() => expect(received).toHaveLength(1));
  expect(received[0].hr_bpm).toBe(87);

  unsubscribe();
});
```

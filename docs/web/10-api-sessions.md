# web/10 · API Sessions Endpoints

## Feature scope

Session lifecycle endpoints: create, list, fetch detail, end, get review data, replace labels.

## Depends on

- `02-database-schema.md`
- `algorithms/01-service-api.md` (we call algo service on session-end)

## Endpoints

### `POST /api/sessions`

Create a new session.

**Body:** `{ horse_id, band_id, activity_type, client_session_id }`
**Response:** `{ id, start_time }`

Validates: rider has permission for horse, band is not in active use elsewhere.

**Idempotency:** if `client_session_id` matches an existing session for this rider, returns that session unchanged (200 OK). Prevents double-tap from creating duplicate sessions. See `shared/09-v0-1-hardening.md`.

### `GET /api/sessions?horse_id=&from=&to=&limit=`

List sessions visible to the caller (rider sees own; admin sees all).

### `GET /api/sessions/:id`

Fetch a single session with metrics.

### `PATCH /api/sessions/:id`

End or update a session.

**Body:** `{ action: 'end', notes?: string }` or `{ notes: string }`

When `action: 'end'`:
1. Set `end_time`, `status: 'completed'`
2. **Insert row into `compute_jobs` table (status='queued', attempts=0)** — see `shared/09-v0-1-hardening.md`
3. Return immediately to PWA in <200 ms (no HTTP call to algo)
4. Cron picks up job within 60 seconds, posts to algo `/compute` with retry on failure

PWA polls `/sessions/:id/review` until algo result is ready. Same UX as before; the job queue is invisible to riders.

### `GET /api/sessions/:id/review`

Returns the data needed for the post-session review screen:

```json
{
  "session": { "id", "horse_name", "duration_s", "activity_type", "metrics_status" },
  "labels": [{ "id", "start_ms", "end_ms", "label_type", "source", "confidence" }],
  "metrics": { "hr_avg", "hr_peak", "trimp", "rmssd", "recovery_tau_s" },
  "hr_trace": [{ "t_ms", "hr" }]
}
```

If `metrics_status` is `pending` or `computing`, the review screen shows a spinner.

### `POST /api/sessions/:id/labels`

Replace label set after rider correction.

**Body:** `{ labels: [{ start_ms, end_ms, label_type, jump_count? }] }`

Server deletes existing labels and inserts new with `source: 'corrected'`.

### `DELETE /api/sessions/:id`

Soft-delete a session. Admin-only. Sets `status: 'abandoned'`. Samples remain.

## Files

```
app/api/sessions/route.ts                 ← POST + GET (≤ 130 lines)
app/api/sessions/[id]/route.ts            ← GET + PATCH + DELETE (≤ 130 lines)
app/api/sessions/[id]/review/route.ts     ← GET (≤ 100 lines)
app/api/sessions/[id]/labels/route.ts     ← POST (≤ 100 lines)
lib/api/session-helpers.ts                 ← shared validation (≤ 100 lines)
lib/api/algo-client.ts                     ← HTTP call to algo service (≤ 80 lines)
tests/integration/sessions.test.ts
```

## Algo client

```typescript
// lib/api/algo-client.ts

export async function triggerCompute(session_id: string): Promise<void> {
  const url = `${process.env.ALGO_SERVICE_URL}/compute`;
  const token = process.env.ALGO_BEARER_TOKEN!;
  
  // Fire-and-forget; algo writes results to DB
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id }),
  }).catch(err => {
    console.error('Algo trigger failed', err);
    // Mark session as 'metrics_status: failed'
  });
}
```

## Integration test

```typescript
test('full session lifecycle', async () => {
  const rider = await createTestRider();
  const horse = await createTestHorse({ riders: [rider.id] });
  
  // Start
  const create = await api.post('/api/sessions', { 
    horse_id: horse.id, activity_type: 'riding' 
  }, rider);
  expect(create.status).toBe(200);
  const session_id = create.body.id;
  
  // Stream samples
  await api.post('/api/ingest/samples', {
    session_id,
    samples: { hr: makeSamples(100), acc: makeSamples(2500), ecg: makeSamples(13000) }
  }, rider);
  
  // End
  const end = await api.patch(`/api/sessions/${session_id}`, { action: 'end' }, rider);
  expect(end.status).toBe(200);
  
  // Review (poll)
  await waitFor(async () => {
    const review = await api.get(`/api/sessions/${session_id}/review`, rider);
    expect(review.body.session.metrics_status).toBe('complete');
  });
  
  // Approve labels
  await api.post(`/api/sessions/${session_id}/labels`, {
    labels: [{ start_ms: 0, end_ms: 100_000, label_type: 'walk' }]
  }, rider);
});
```

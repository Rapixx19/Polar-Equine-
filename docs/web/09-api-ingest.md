# web/09 · API Ingest Endpoints

## Feature scope

The high-throughput endpoints the PWA's BLE batcher posts to during a session.

## Depends on

- `02-database-schema.md` (samples_* tables)

## Endpoints

### `POST /api/ingest/samples`

Bulk-insert sample batches. Called every ~2 seconds during a session.

**Auth:** Logged-in rider (cookie). Service-role bypass also accepted via bearer token (for the algo service if needed).

**Request body:**
```json
{
  "session_id": "uuid",
  "samples": {
    "hr": [
      { "t_ms": 1730289600000, "hr": 32, "rr": 1850, "contact": true }
    ],
    "acc": [
      { "t_ms": 1730289600000, "ax": 0.01, "ay": -0.03, "az": 1.001 }
    ],
    "ecg": [
      { "t_ms": 1730289600000, "uv": 145 }
    ]
  }
}
```

**Response:**
```json
{
  "received": { "hr": 12, "acc": 50, "ecg": 130 },
  "rejected": 0
}
```

Errors:
- `401` if not authed
- `403` if session.rider_id != auth.uid
- `404` if session_id doesn't exist
- `409` if session.status != 'active'
- `400` if payload schema invalid

## Files

```
app/api/ingest/samples/route.ts          ← ≤ 130 lines
lib/api/ingest-validation.ts              ← Zod schemas (≤ 100 lines)
lib/api/sample-insert.ts                  ← bulk insert helpers (≤ 100 lines)
tests/integration/ingest.test.ts          ← Vitest + MSW
```

## Implementation sketch

```typescript
// app/api/ingest/samples/route.ts

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const user = await getUser(supabase);
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = IngestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { session_id, samples } = parsed.data;
  
  // Verify session ownership
  const session = await fetchSession(supabase, session_id);
  if (!session) return notFound();
  if (session.rider_id !== user.id) return forbidden();
  if (session.status !== 'active') return conflict('SESSION_NOT_ACTIVE');

  // Bulk insert
  const counts = await Promise.all([
    insertHRSamples(supabase, session_id, samples.hr),
    insertACCSamples(supabase, session_id, samples.acc),
    insertECGSamples(supabase, session_id, samples.ecg),
  ]);

  return NextResponse.json({
    received: { hr: counts[0], acc: counts[1], ecg: counts[2] },
    rejected: 0
  });
}
```

## Performance

Target: < 200ms response time for a batch of ~200 samples.

Optimization: use Supabase's batch insert, do all three streams in parallel, return immediately without waiting for any compute.

## Integration test

```typescript
// tests/integration/ingest.test.ts

test('rider can post samples to their own active session', async () => {
  const rider = await createTestRider();
  const session = await createTestSession({ rider_id: rider.id, status: 'active' });
  
  const response = await fetch('/api/ingest/samples', {
    method: 'POST',
    headers: { Cookie: rider.sessionCookie },
    body: JSON.stringify({
      session_id: session.id,
      samples: {
        hr: [{ t_ms: 1730289600000, hr: 32, rr: 1850 }],
        acc: [{ t_ms: 1730289600000, ax: 0, ay: 0, az: 1 }],
        ecg: [{ t_ms: 1730289600000, uv: 145 }],
      }
    }),
  });
  
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.received).toEqual({ hr: 1, acc: 1, ecg: 1 });
});

test('rejects samples from a different rider', async () => {
  const a = await createTestRider();
  const b = await createTestRider();
  const session = await createTestSession({ rider_id: a.id });
  
  const response = await fetch('/api/ingest/samples', {
    headers: { Cookie: b.sessionCookie },
    method: 'POST',
    body: JSON.stringify({ session_id: session.id, samples: { hr: [], acc: [], ecg: [] } }),
  });
  
  expect(response.status).toBe(403);
});
```

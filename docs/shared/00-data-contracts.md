# shared/00 · Data Contracts

Canonical JSON shapes that move between web ↔ algo and PWA ↔ web. **If you change one of these, change it in both places. Bumping a version is preferable to breaking compatibility.**

## Sample ingest payload

PWA → Web: `POST /api/ingest/samples`

```typescript
{
  session_id: string,         // uuid
  samples: {
    hr: Array<{
      t_ms: number,           // unix ms
      hr: number,             // bpm
      rr: number | null,      // ms, null when no R-R in this notification
      contact: boolean,       // skin contact flag from H10
    }>,
    acc: Array<{
      t_ms: number,
      ax: number,             // g
      ay: number,
      az: number,
    }>,
    ecg: Array<{
      t_ms: number,
      uv: number,             // signed microvolts
    }>,
  }
}
```

Response:

```typescript
{
  received: { hr: number, acc: number, ecg: number },
  rejected: number,           // count rejected from validation
}
```

## Compute trigger

Web → Algo: `POST /compute`

```typescript
{
  session_id: string,
}
```

Algo response:

```typescript
{
  status: "complete" | "failed" | "queued",
  metrics_id?: string,
  label_count?: number,
  error?: string,
}
```

## Session metrics row (DB-backed, both repos read/write)

```typescript
type SessionMetrics = {
  session_id: string,
  duration_s: number,
  
  hr_avg: number,
  hr_peak: number,
  hr_min: number,
  hr_sd: number,
  
  rmssd_ms: number | null,
  sdnn_ms: number | null,
  pnn50_pct: number | null,
  
  trimp_banister: number,
  recovery_tau_s: number | null,
  
  time_z1_s: number,
  time_z2_s: number,
  time_z3_s: number,
  time_z4_s: number,
  time_z5_s: number,
  
  time_walk_s: number,
  time_trot_s: number,
  time_canter_s: number,
  time_gallop_s: number,
  time_rest_s: number,
  jump_count: number,
  
  algo_version: string,
  quality_score: number,      // 0..1
  notes: string,              // JSON-encoded module-level details
  
  computed_at: string,        // ISO timestamp
};
```

## Label

```typescript
type Label = {
  id: string,
  session_id: string,
  start_ms: number,           // RELATIVE to session start, not UTC
  end_ms: number,
  label_type: "walk" | "trot" | "canter_gallop" | "jump" | "rest" | "other",
  jump_count: number | null,
  confidence: number | null,
  source: "auto" | "manual" | "corrected",
  created_at: string,
};
```

## Review payload

Web → PWA: `GET /api/sessions/[id]/review`

```typescript
{
  session: {
    id: string,
    horse_name: string,
    duration_s: number,
    activity_type: string,
    metrics_status: "pending" | "computing" | "complete" | "failed",
  },
  labels: Label[],            // see above
  metrics: SessionMetrics | null,  // null until metrics_status='complete'
  hr_trace: Array<{
    t_ms: number,             // RELATIVE to session start
    hr: number,
  }>,                         // downsampled to ~600 points for chart rendering
}
```

## Anomaly flag

```typescript
type AnomalyFlag = {
  id: string,
  horse_id: string,
  session_id: string,
  metric: "resting_hr" | "rmssd",
  severity: "watch" | "alert",
  observed: number,
  baseline_mean: number,
  baseline_sd: number,
  z_score: number,
  suggested_action: string,
  created_at: string,
  acknowledged_at: string | null,
};
```

## Versioning

When a contract changes incompatibly:

1. Bump the major version of the affected algo module (`ALGO_VERSION`)
2. Add a `schema_version` field to the new payload
3. Web side reads the `schema_version` and dispatches to the right handler
4. Old versions remain supported for at least 30 days during transition
5. Migration script populates the new field on historical rows

For V.0 (no historical contract obligations), simply update both sides simultaneously and redeploy together.

## Validation conventions

- Web: Zod schemas in `lib/validation/`. Every API route validates the request body before any work.
- Algo: Pydantic models in `app/routes/`. FastAPI auto-validates.
- Both: Reject extra unknown fields rather than silently ignoring (`strict: true` in Zod, `extra: "forbid"` in Pydantic).

## Tests

Both repos have a contract test that round-trips a fixture:

```typescript
// lafattoria-web/tests/integration/contracts.test.ts
test('SessionMetrics from algo round-trips through Zod schema', () => {
  const fromAlgo = JSON.parse(readFileSync('fixtures/algo-metrics.json', 'utf8'));
  const parsed = SessionMetricsSchema.parse(fromAlgo);
  expect(parsed.session_id).toBeDefined();
});
```

```python
# lafattoria-algo/tests/integration/test_contracts.py
def test_session_metrics_matches_web_schema():
    """The dataclass we produce is parseable as the web's expected shape."""
    metrics = make_test_metrics()
    json_str = json.dumps(asdict(metrics))
    # Validate against schema (loaded from web side as JSON Schema)
    jsonschema.validate(json.loads(json_str), WEB_METRICS_SCHEMA)
```

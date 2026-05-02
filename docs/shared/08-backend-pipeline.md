# shared/08 · Backend Data Processing Pipeline

## Why this exists

The single most important diagram for V.0. Anyone joining the project should be able to read this and understand exactly what happens to a piece of data from the moment the H10 reads it to the moment it's a row in `session_metrics`.

## The pipeline, end-to-end

```
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 0 — CAPTURE (on the horse)                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Polar H10 Equine                                                      │
│   │                                                                    │
│   ├─ ECG @ 130 Hz, 14-bit signed microvolts                            │
│   ├─ R-R intervals @ ~per-beat (driven by HR)                          │
│   ├─ Heart rate @ ~1 Hz (computed on-band from ECG)                    │
│   └─ Accelerometer @ 52 Hz, 3-axis ±8g                                 │
│   │                                                                    │
│   ▼ Bluetooth LE notifications                                         │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 1 — PHONE (rider's device)                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  PWA running in browser (Chrome/Edge on Android, Bluefy on iPhone)     │
│   │                                                                    │
│   ├─ Web Bluetooth subscribes to HR + PMD characteristics              │
│   ├─ PMD codec decodes binary frames → typed sample objects            │
│   ├─ Live HR rendered to screen for rider feedback                     │
│   ├─ Batcher accumulates samples for 2 seconds                         │
│   └─ Every 2 s: POST { session_id, samples } to /api/ingest/samples    │
│   │                                                                    │
│   IndexedDB queue if offline → replay on reconnect                     │
│   │                                                                    │
│   ▼ HTTPS                                                              │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 2 — VERCEL API (web)                                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  /api/ingest/samples                                                   │
│   │                                                                    │
│   ├─ Auth: Supabase user cookie (rider) or service-role bearer         │
│   ├─ Validate: Zod schema, physiological bounds                        │
│   ├─ Verify: session.rider_id == auth.uid, session.status == 'active'  │
│   └─ Bulk insert: Promise.all([insert_hr, insert_acc, insert_ecg])     │
│   │                                                                    │
│   ▼                                                                    │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 3 — SUPABASE POSTGRES (storage)                                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Tables (raw data, RLS-protected)                                      │
│   ├─ samples_hr  (id, session_id, t_ms, hr, rr, contact)               │
│   ├─ samples_acc (id, session_id, t_ms, ax, ay, az)                    │
│   └─ samples_ecg (id, session_id, t_ms, uv)                            │
│                                                                        │
│  Realtime channel pushes new HR samples back to PWA recording screen   │
│   ▼                                                                    │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    [ Session continues, samples stream every 2s ]
                              │
                              │  Rider taps "End"
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 4 — SESSION END TRIGGER                                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  PATCH /api/sessions/:id  { action: 'end' }                            │
│   │                                                                    │
│   ├─ Set session.end_time, session.status = 'completed'                │
│   ├─ Set session.metrics_status = 'pending'                            │
│   └─ Async fire-and-forget: POST algo.lafattoria.app/compute           │
│       Authorization: Bearer ALGO_BEARER_TOKEN                          │
│       Body: { session_id }                                             │
│   │                                                                    │
│   Returns 200 to PWA immediately. PWA polls /sessions/:id/review       │
│   until metrics_status == 'complete'.                                  │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 5 — RAILWAY ALGO SERVICE (Python)                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  POST /compute  (FastAPI)                                              │
│   │                                                                    │
│   ├─ Verify bearer token                                               │
│   ├─ Read session row from Supabase                                    │
│   ├─ Set metrics_status = 'computing'                                  │
│   │                                                                    │
│   ├─ STAGE 5a: Read raw samples in parallel                            │
│   │   └─ asyncio.gather(read_hr, read_acc, read_ecg)                   │
│   │                                                                    │
│   ├─ STAGE 5b: Clean R-R intervals                                     │
│   │   └─ rr_cleaning.clean(rr_ms)                                      │
│   │      ├─ Reject <800ms or >3000ms (physiological bounds)            │
│   │      ├─ Detect 2°-AV blocks → protect from correction              │
│   │      ├─ Apply Lipponen-Tarvainen via neurokit2                     │
│   │      └─ Return cleaned series + corrections count                  │
│   │                                                                    │
│   ├─ STAGE 5c: Compute HRV metrics                                     │
│   │   └─ hrv_metrics.compute(rr_clean) → RMSSD, SDNN, pNN50            │
│   │                                                                    │
│   ├─ STAGE 5d: Compute workload                                        │
│   │   └─ trimp_zones.compute(hr) → TRIMP, time-in-zones                │
│   │                                                                    │
│   ├─ STAGE 5e: Fit recovery curve (riding only)                        │
│   │   └─ recovery_tau.fit(hr) → τ, peak HR, baseline                   │
│   │                                                                    │
│   ├─ STAGE 5f: Detect gaits (riding only)                              │
│   │   └─ gait_detection.detect_gaits(acc) → list[GaitSegment]          │
│   │      ├─ FFT in 4s windows                                          │
│   │      ├─ Classify by dominant frequency                             │
│   │      ├─ Median-filter labels                                       │
│   │      ├─ Merge contiguous, drop short segments                      │
│   │      └─ Separate jump-detection pass (g-spike threshold)           │
│   │                                                                    │
│   ├─ STAGE 5g: Evaluate quality                                        │
│   │   └─ data_quality.evaluate(session_id) → quality 0..1              │
│   │                                                                    │
│   ├─ STAGE 5h: Compose session_metrics row                             │
│   │   └─ session_metrics.compose(...) → SessionMetricsRow              │
│   │                                                                    │
│   ├─ STAGE 5i: Persist                                                 │
│   │   ├─ Write labels rows (source='auto')                             │
│   │   ├─ Write session_metrics row                                     │
│   │   └─ Set metrics_status = 'complete'                               │
│   │                                                                    │
│   └─ Return { status: 'complete', label_count: N }                     │
│                                                                        │
│  Total time: < 8 seconds for a 50-minute session                       │
└────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STAGE 6 — REVIEW (back to phone)                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  PWA polls /api/sessions/:id/review                                    │
│   │                                                                    │
│   When metrics_status == 'complete':                                   │
│   ├─ Show auto-detected gait timeline                                  │
│   ├─ Show key metrics (HR, RMSSD, TRIMP, τ)                            │
│   ├─ Rider taps approve OR edits the timeline                          │
│   └─ POST /api/sessions/:id/labels with corrected labels               │
│      → labels rewritten with source='corrected'                        │
│      → session.status = 'approved'                                     │
└────────────────────────────────────────────────────────────────────────┘
```

## Key invariants

These must always hold; if any breaks, it's a P1 bug:

1. **Raw samples are immutable.** Once written to `samples_hr`, `samples_acc`, `samples_ecg`, they are never modified. Cleaning produces new artifacts; original recordings are preserved forever.

2. **Sample-to-session linkage uses `session_id`, not timestamps.** Even if a phone's clock is wrong, samples reach the right session.

3. **Algo idempotency.** Calling `/compute` twice on the same session_id returns 409 the second time. To force, use `/recompute` which deletes auto-labels and metrics first.

4. **Quality scores propagate.** Every algorithm output carries a quality score. Consumers know when data is suspect.

5. **No silent failures.** A failed compute marks `metrics_status = 'failed'` and surfaces in admin dashboard.

## What this enables

This pipeline gives you, by design:

- Reproducibility — given a session_id and an algo_version, you can re-derive every metric
- Auditability — every value in `session_metrics` traces back to specific raw samples
- Transparency — the algorithms are inspectable code, not black boxes
- Modularity — replace any one stage without affecting the others
- Quality awareness — every consumer knows how trustworthy a value is

These are the four properties that make this a research instrument rather than a toy.

## Where each stage's spec lives

| Stage | Spec |
|---|---|
| 0 — Capture | hardware brief (separate doc, not in `/docs`) |
| 1 — Phone | `web/03-pwa-band-pairing.md`, `web/14-pwa-vitals-home.md` |
| 2 — API | `web/09-api-ingest.md` |
| 3 — Storage | `02-database-schema.md` |
| 4 — Session end | `web/10-api-sessions.md` |
| 5 — Algo | `algorithms/01-service-api.md` and `02-08` |
| 6 — Review | `web/04-pwa-label-review.md` |
| Quality | `shared/05-data-quality.md` |
| Export | `shared/06-data-export.md` |

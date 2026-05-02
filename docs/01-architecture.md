# 01 · Architecture

## High-level data flow

```
   PHONE (rider)                              VERCEL (web)              RAILWAY (algo)
   ─────────────                              ──────────                ──────────────
   Polar H10 ──BLE──▶ PWA ──HTTPS──▶ /api/ingest/samples ──▶ Supabase
                       │                          │
                       │                          │ on session end
                       │                          ▼
                       │                  /api/sessions/end
                       │                          │
                       │                          └──▶ INSERT compute_jobs
                       │                                       │
                       │                                       │ Vercel cron (every 1 min)
                       │                                       ▼
                       │                                  /api/cron/compute-runner
                       │                                       │
                       │                                       └─── HTTPS ──▶ POST /compute
                       │                                                          │
                       │                                                          ▼
                       │                                              algo reads samples,
                       │                                              writes metrics + labels
                       │                                                          │
                       │ Realtime ◀──────────────────────────────────────────────┘
                       │ (push results back to PWA)
                       ▼
                  Show review screen
                  (rider approves/corrects)
```

Critical change from earlier draft: web does NOT directly call algo. Web enqueues a job. Cron picks it up. **Reason:** algo failures used to silently strand sessions at `metrics_status='pending'` forever. Job queue gives us retries with exponential backoff and explicit failure marking. See `shared/09-v0-1-hardening.md` Fix 2.

## The two repos and their boundaries

### `lafattoria-web` (Vercel)

Owns:
- Everything the user sees (PWA, admin dashboard)
- All HTTP API routes (`/api/*`)
- Bluetooth communication (Web Bluetooth in browser)
- Database reads/writes via Supabase client
- Auth flow (magic-link via Supabase Auth)
- Realtime channels (live HR, session updates)

Does NOT own:
- Signal processing of any kind
- Algorithms (HRV math, gait detection, anything statistical)
- Heavy data transformation

### `lafattoria-algo` (Railway)

Owns:
- All algorithm implementations (cardiac, gait, metrics, anomaly)
- FastAPI service exposing `POST /compute` and friends
- Reads raw samples from Supabase, writes computed results back
- Cardiac signal processing libraries (neurokit2 etc.)

Does NOT own:
- Any user-facing surface
- Any Bluetooth code
- Auth flows (uses bearer token only)

### Why this split

Three reasons:

1. **Different deploy cadences.** Algorithm changes happen weekly during research; PWA changes happen daily early on. Independent deploys reduce risk.
2. **Different language strengths.** Python's scientific libraries dominate cardiac signal processing. TypeScript dominates web/realtime/UI.
3. **Different scaling profiles.** Algorithm compute is bursty (heavy at session-end, idle in between). Web is steady. Independent scaling.

## How the two repos communicate

**Direction 1: Web → Algo (synchronous)**

When a session ends, `/api/sessions/end` (web) calls `POST /compute` (algo) over HTTPS with the session_id. Algo reads samples from Supabase, computes metrics, writes results back to Supabase, returns success. Web reads the results from Supabase and shows them to the rider.

**Direction 2: Algo → Web (none, intentionally)**

Algo never calls web. It writes its results to Supabase. Web sees the results via Supabase Realtime. **One-way dependency** keeps things simple.

## Data flow during a riding session

1. Rider opens PWA, logs in via magic link if not already authed
2. Taps "Start session" → picks horse → taps "Connect band"
3. Browser shows native Bluetooth picker; rider selects Polar H10
4. PWA opens BLE GATT connection, subscribes to HR/PMD characteristics, writes start commands
5. PWA POSTs `/api/sessions/start` → web creates session row in Supabase, returns session_id
6. PWA streams samples: every 2 seconds, batches all received samples and POSTs to `/api/ingest/samples`
7. Web validates batch, inserts into `samples_*` tables linked by session_id
8. Realtime channel pushes "live HR" back to the PWA's recording screen (every ~2s)
9. Rider taps "End" → PWA POSTs `/api/sessions/end` with session_id
10. Web does session sample assignment, then calls algo: `POST /compute { session_id }`
11. Algo reads samples from Supabase, runs Layer 1+2 algorithms, writes:
    - `session_metrics` row (HR avg/peak, RMSSD, SDNN, recovery τ, TRIMP)
    - `labels` rows with `source='auto'` (auto-detected gait segments)
12. Algo returns success to web
13. Web returns success to PWA
14. PWA navigates to review screen → fetches `/api/sessions/{id}/review` → renders auto-labels for rider approval
15. Rider taps approve, or edits and taps approve
16. PWA POSTs `/api/sessions/{id}/labels` → web replaces auto-labels with corrected versions, marks session approved
17. Rider sees confirmation, returns to home

## Auth model summary

Three distinct identities in the system:

| Identity | Auth method | Scope |
|---|---|---|
| Rider | Magic link via Supabase Auth | Their own sessions, horses they're authorized to ride |
| Admin | Magic link + admin role flag | Everything |
| Algo service | Bearer token (incoming only) | Verifies bearer header on POST /compute (web's cron is the caller) |

See `03-auth-and-permissions.md` for full detail.

## Concurrency model

**Multiple riders simultaneously:** supported natively. Each phone is its own client. Each session has its own session_id. Sample inserts are independent. No locking required.

**Multiple bands per rider:** rare but supported. PWA tracks paired bands per device. A rider could in principle ride two horses with two bands using two separate session-start flows. Not a primary use case.

**Rider on two devices:** allowed but only one device "owns" an active session at a time. If a session is active on phone A and the rider tries to start a new session on phone B for the same horse, phone B sees "session already in progress on another device."

**Admin and rider simultaneously:** completely independent. Admin reads via dashboard; rider writes via PWA. No conflict.

## Data integrity guarantees

1. **Sample timestamps** come from the phone's UTC clock at the moment Web Bluetooth delivers the notification. Phone clocks drift but are usually within ±5s of true UTC. Adequate for V.0.
2. **Session start/end times** are server-stamped (Vercel UTC) when the API route fires. Authoritative.
3. **Sample-to-session linkage** uses the session_id passed in the ingest payload, NOT timestamp matching. If a rider's phone clock is wrong, samples still go to the right session.
4. **Algorithm idempotency** — calling `/compute` on the same session_id twice produces the same result. Re-runs are safe.
5. **Concurrent writes** — Supabase row-level locking handles concurrent inserts correctly.

## Resilience and failure modes

| Failure | Behavior |
|---|---|
| Phone loses internet mid-session | PWA queues samples in IndexedDB, replays on reconnect |
| Phone loses BLE mid-session | PWA shows "band signal lost" banner, attempts auto-reconnect |
| Algo service down at session-end | Web returns success to PWA but flags session as "metrics pending"; admin retry endpoint re-fires compute |
| Vercel region outage | Frontend down; samples buffered locally; replay on recovery |
| Supabase region outage | Whole system unavailable until restored; nothing recoverable in this case |
| Rider closes PWA mid-session | Service Worker keeps page alive briefly; if killed, session enters "abandoned" state, no harm done |

## Performance budget for V.0

| Operation | Target | Acceptable |
|---|---|---|
| `/api/ingest/samples` POST | < 200 ms | < 500 ms |
| `/api/sessions/end` (full chain incl. compute) | < 8 s | < 20 s |
| PWA initial load on 4G | < 3 s | < 6 s |
| Live HR latency (band → PWA display) | < 2 s | < 5 s |
| Algo `/compute` for 50-min session | < 6 s | < 15 s |

## Out-of-scope architectural decisions

These are explicitly NOT addressed in V.0 and require future thought:

- Multi-region deployment
- Per-stable data isolation
- Mobile push notifications
- Apple Watch / wearable companion
- Offline-first sync engine (we have basic offline buffering, not full sync)
- Bandwidth-constrained operation (assumes always-online stable wifi)
- Encrypted-at-rest sample data beyond Supabase defaults
- Hardware security module for ECG signing (V.1 + FEI-grade requirement)

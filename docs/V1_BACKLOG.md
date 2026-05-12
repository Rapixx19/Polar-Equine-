# V1_BACKLOG.md

> Items deferred from V.0 to V.1 (or beyond). Captured here so they're documented and not lost, but explicitly NOT blocking V.0 ship.
>
> Added by the CEO-level spec review. Each item has a real argument, but for a research thesis on a free-tier deployment, none rise to "must do before first real session."

## Why these aren't in V.0

V.0 is a research thesis platform on free infrastructure, with one project owner and a small number of riders. The maturity bar is "produces clean, exportable, defensible data," not "Series-A startup with paying customers."

The items below are good engineering practices for a commercial SaaS. Apply them when V.0 graduates to V.1 (commercial product with paying users) or when a specific incident makes one of them the bottleneck.

## Operational hardening

### Deployment & environments

- **Staging environment** (`staging.lafattoria.app`, `algo-staging.lafattoria.app`)
  - V.0 uses Vercel preview deploys per-PR as ad-hoc staging
  - V.1: dedicated staging when there are real users to protect

- **Down migrations for every up migration**
  - V.0: forward-only migrations are fine for a small dataset
  - V.1: every migration must have a reverse, tested in CI

- **Doppler / 1Password for env var sync**
  - V.0: manual paste into Vercel + Railway dashboards
  - V.1: secrets manager when team grows beyond 1-2 people

- **Documented rollback playbook**
  - V.0: Vercel/Railway have one-click rollback in their UIs, that's enough
  - V.1: written runbook with named on-call contacts

### Database & security

- **Replace `SUPABASE_SERVICE_ROLE_KEY` with scoped `algo_writer` Postgres role**
  - V.0: service-role bypasses RLS, that's how the algo service writes
  - V.1: create a custom role with only the permissions algo actually needs

- **`admin_access_log` audit table**
  - V.0: Supabase provides basic auth event logs in their dashboard
  - V.1: full audit trail of admin actions

- **Bearer token rotation policy (90 days, log SHA prefix only)**
  - V.0: token is generated once, rotated only if leaked
  - V.1: scheduled rotation as part of security hygiene

- **CSRF Origin header check on mutating routes**
  - V.0: Supabase Auth cookies are SameSite=Lax which mitigates CSRF for V.0 use cases
  - V.1: explicit Origin header verification on all POST/PATCH/DELETE

- **GDPR consent form covering biometric data + research-to-commercial transfer**
  - V.0: rider acknowledgment in the welcome screen
  - V.1: legal review and formal consent capture before commercial launch
  - **Note:** if you ever publish a paper on V.0 data, IE thesis supervisor must review consent BEFORE field study starts

### Observability

- **Structured logging (pino in web, structlog in algo)**
  - V.0: console.log + Vercel/Railway log streams are sufficient
  - V.1: structured JSON logs with request IDs

- **Custom metrics + Vercel Analytics**
  - V.0: Vercel built-in analytics are enough
  - V.1: custom event metrics for product KPIs

- **Alerts: stuck-pending sessions, compute failure rate, /health 5xx**
  - V.0: weekly manual check
  - V.1: PagerDuty / Better Stack / similar

- **Day-1 dashboard (sessions/day, quality score, compute success rate)**
  - V.0: weekly check via admin dashboard manually
  - V.1: live Grafana / Metabase dashboard

- **Request tracing PWA → web → algo**
  - V.0: not needed for debugging at this scale
  - V.1: distributed tracing when there are 5+ services

### Testing

- **Hardware-in-loop integration test in CI**
  - **Cannot be done.** GitHub Actions can't run a Polar H10. The smoke test IS the human strapping the band on.
  - V.1 alternative: a dedicated test rig at the office with a band on a test load

- **Hypothesis fuzz on PMD codec**
  - V.0: unit tests with hand-crafted edge cases are sufficient
  - V.1: property-based fuzz when the codec is more critical

- **k6 load test (10+ concurrent sessions)**
  - V.0: realistic load is 1-3 concurrent sessions, no need
  - V.1: when scaling to multi-stable

- **Migration reversibility test**
  - Pairs with "down migrations" above. Defer together to V.1.

### Algo

- **Failure-injection pytest cases (BLE drop, partial data, sensor flatline)**
  - V.0: existing tests cover happy path + a few edge cases
  - V.1: comprehensive failure injection when the algo is published

- **Algo version pinning when /recompute runs months later**
  - V.0: only one algo version exists
  - V.1: when there are multiple deployed algo versions, lock metrics to the version that produced them

- **Sharad screencast walkthrough of `gait_detection.py` and `rr_cleaning.py`**
  - V.0: docs in `algorithms/06-gait-detection.md` and `02-rr-cleaning.md` are the walkthrough
  - V.1: video walkthrough when onboarding additional contributors

### UX & product

- **Structured exercise taxonomy on the review screen**
  - V.0: riders capture exercise detail in the free-text Notes field on the review screen ("20m circle, then leg-yield, grid of 4 fences at 80cm"). Searchable but not queryable.
  - V.1: predefined exercise chips on the review screen (shoulder-in, leg-yield, 20m circle, lateral work, gymnastic grid, dressage figure, etc.) backed by an `exercises` table. Lets us correlate HRV / recovery / gait quality to specific exercise types instead of only to coarse activity contexts.
  - Rough scope when reactivated: ~3 hrs (one slice). Would have been Slice 15.5. Deferred 2026-05-02 because the V.0 thesis question is about the seven activity contexts, not exercise-level granularity.

- **Mid-session manual marking ("started jumping now")**
  - V.0: rider only labels post-session in the review screen
  - V.1: in-session tap marker for "this just happened" — useful for commercial users who want a Strava-like live segment workflow. Not needed for thesis: post-session labelling is faster and the auto-detector handles it.

- **Per-jump metadata (height, spread, fence type)**
  - V.0: rider enters total jump count post-session; descriptive detail goes in free-text Notes
  - V.1: per-fence entry with structured height/spread/type. Enables jump-effort metrics. Defer until commercial users actually ask for it.

- **Push notifications**
  - V.0: in-app review screen only, no notifications
  - V.1: when riders need cross-session reminders

- **Cursor-based pagination on admin sessions list**
  - V.0: limit-offset is fine up to ~10K sessions
  - V.1: cursor pagination at scale

- **Review screen partial-state render** (HRV ok, gait failed)
  - V.0: review screen waits for full compute or shows "failed"
  - V.1: graceful degradation when one algorithm module fails but others succeed

- **In-app data deletion flow (GDPR right-to-erasure)**
  - V.0: email admin to request deletion
  - V.1: in-app self-service deletion with 30-day soft-delete window

- **"Compute retry" admin UI button**
  - V.0: admin uses /recompute endpoint via curl
  - V.1: button in admin dashboard

### Infrastructure

- **Feature flags table**
  - V.0: deploy flags via env vars when needed
  - V.1: when feature toggling becomes operationally important

- **Multi-stable permission isolation**
  - V.0: single-stable deployment per install
  - V.1: stable-level permission boundaries

## V.1 custom-band sensors

> Anchor target for `docs/algorithms/06-gait-detection.md` and future spec rewrites. Captures the sensor modalities the V.1 custom band is expected to add on top of the H10 floor (3-axis ACC ≥50 Hz, ±8 G, ECG/HR/RR), and what each one unlocks algorithmically.

The V.1 band roadmap (vendor email 2026-05-08) names: higher-rate ACC + gyroscope, magnetometer, skin temperature, barometric pressure, optional audio, and a V.2 path to GNSS + cellular telemetry. We intentionally do NOT design V.0 around these. The classifier and metrics must stand on H10 inputs alone; each item below is a **bonus** that gets unlocked if and when the hardware lands.

### Gyroscope (V.1)

- **V.0 status:** Not present on H10. Compensated with autocorrelation + spectral features on accel magnitude.
- **V.1 unlock:** Expect +5–10 pp gait accuracy ([Rana & Mittal 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC9817528/) hit 94.4% with gyro). Enables limb-phase estimation and cleaner canter↔gallop separation.
- **Algorithm change:** Add 3 angular-velocity features (peak rate, rms, dominant freq) per axis to the feature vector. Retrain RF; optionally reconsider 1D CNN.
- **Effort:** ~2 hrs spec + ~6 hrs retrain + validation. Lives in a future Slice 13.X.

### Magnetometer (V.1)

- **V.0 status:** Not present. Girth-strap rotation handled by magnitude-based features + periodic gravity recal during detected halts.
- **V.1 unlock:** +3–5 pp gait accuracy from true orientation tracking; enables heading-stable per-axis features instead of magnitude-only.
- **Algorithm change:** Sensor-fusion step (complementary or Madgwick filter) → world-frame accel. Add vertical-only and forward-only band powers.
- **Effort:** ~4 hrs filter + ~4 hrs feature integration. Pairs naturally with gyro work.

### Skin temperature (V.1)

- **V.0 status:** Not measured. Fever / thermal stress invisible to V.0 algorithms.
- **V.1 unlock:**
  - Fever / illness alerts (baseline + delta thresholds per horse).
  - Thermal HRV normalisation — RMSSD has known temperature dependence; correcting for it tightens cross-session comparisons.
  - Post-exercise thermal-recovery curve as a sibling metric to HR recovery τ.
- **Algorithm change:** New `temperature_metrics` table; per-horse baseline learning over first 5 sessions; thermal-corrected HRV variant alongside raw.
- **Effort:** ~4 hrs ingest + ~4 hrs baseline learner + ~3 hrs review-screen surface. A clean Slice 11.6-equivalent in V.1.

### Barometric pressure (V.1)

- **V.0 status:** Not measured. Altitude unknown. Jump detection uses accel impulse only.
- **V.1 unlock:**
  - Altitude correction for sessions across stables of different elevation.
  - **Jump-event confirmation:** barometric dip during airborne phase is an orthogonal signal — combines with the accel free-fall signature for high-precision jump detection (very low false-positive rate).
  - **Respiration rate estimation** from mid-frequency baro oscillations during halts and walk — published technique with chest-mounted baro.
- **Algorithm change:** Add `pressure_pa` column to chunk schema; multi-modal jump detector (accel AND baro both required for high-confidence jump label); new `respiration_metrics` table populated only from low-motion windows.
- **Effort:** ~3 hrs ingest + ~5 hrs multi-modal jump detector + ~6 hrs respiration MVP. Probably one slice each.

### Audio channel (V.2)

- **V.0 status:** Not on roadmap until V.2.
- **V.2 unlock:**
  - Respiration / coughing detection — significant welfare signal for early-illness screening.
  - Equipment-slap / saddle-fit artefacts identifiable as audio events correlated with accel spikes — distinguishes rider-induced impulses from horse-generated ones.
  - Vocalisation events (neighs, snorts) as a behavioural channel.
- **Algorithm change:** New ingest pipeline (likely opus-encoded chunks to Storage), separate audio-event classifier, no integration with gait RF for v1 of the audio path. Privacy / consent review required before any audio is recorded near humans — flag for IE supervisor.
- **Effort:** Multi-week. Not estimated yet; revisit when V.2 hardware specs are public.

### GNSS (V.2 vendor scope)

- **V.0 status:** Not available. Routes / terrain unknown.
- **V.2 unlock:**
  - Route mapping (paddock work vs trail vs arena), surface-type inference from route.
  - Cross-validates gait classifier — flat ground at 4 m/s ≈ canter, 1.5 m/s ≈ walk; speed becomes a strong prior.
  - Per-session distance + ascent/descent metrics, similar to Strava for horses.
- **Algorithm change:** Speed-from-GNSS becomes a feature in the gait vector. New `route_geometries` table. Privacy: stable locations are sensitive — store rounded centroids only, never raw GPS for paddock-resident horses.
- **Effort:** ~8 hrs ingest + ~6 hrs classifier retrain + ~10 hrs route UI. A whole phase of its own in V.2.

### Cellular telemetry (V.3)

- **V.0 status:** Band streams to phone over BLE; phone uploads. Offline buffering carries the gap.
- **V.3 unlock:**
  - Real-time alerts during stable trips (transport, off-property events) without a paired phone.
  - Direct band → backend sync for unsupervised paddock monitoring.
- **Algorithm change:** Move toward server-driven on-band model deployment; reconsider what runs where. Out of scope for the thesis platform — strictly commercial path.
- **Effort:** Significant infra rework. Not estimated.

### Higher-rate ACC + ECG (V.1 floor, not bonus)

- **V.0 status:** H10 gives 200 Hz tri-axial accel and 130 Hz raw ECG. The gait classifier already downsamples to 50 Hz internally; HRV uses RR intervals from H10's onboard QRS detection.
- **V.1 expectation (vendor confirmed pending):** ≥ 200 Hz accel and ≥ 130 Hz ECG must be preserved. Anything less than this floor would force retraining and degrade HRV precision. Flagged in the open vendor-reply checklist.

### How any of this lands in the codebase

When a V.1 sensor arrives:
1. Extend `signal_chunks` schema (or add a parallel table) for the new modality.
2. Add an ingest test fixture with a recorded sample.
3. Touch only the algorithm(s) that benefit (e.g., gyro → gait; baro → jump + respiration; temp → HRV-normalised). The V.0 H10 path keeps working unchanged; new code paths fork on `sensor_capabilities` per session.
4. Bump `ALGO_VERSION` of any module whose output changes (Rule 13). Re-derived metrics get a new `algo_version` row; old rows stay frozen (Rule 8).

The V.0 design is sensor-additive on purpose: no V.1 unlock should require rewriting code that already works on H10 data.

## Resolved issues from CEO review

The CEO review flagged 43 items. Of those:

- **5 are fixed in V.0** (see `shared/09-v0-1-hardening.md`):
  1. Vercel maxDuration (one-line config)
  2. Compute job queue with retry
  3. RLS policies on samples_* tables
  4. Start session idempotency key
  5. Auto-abandon stale active sessions

- **30+ are deferred to V.1** (this file).

- **A few are wrong/over-engineered for V.0:**
  - Hardware-in-loop CI (impossible)
  - Staging env (preview deploys are enough)
  - k6 load test (premature)

## V.0.1 — first patch release after V.0 ships

These are not blocking V.0 but should be the immediate post-ship priority:

### iPhone Bluefy onboarding fix

V.0 has acknowledged friction for iPhone riders: tap link in Mail → opens in Safari → manually copy URL → paste into Bluefy. Documented in `web/01-pwa-onboarding.md` as a "Known V.0 limitation."

Fix path for V.0.1:
1. Test Bluefy's custom URL scheme on iPhone with the actual band (during day-1 smoke test)
2. If the scheme works: update `/api/auth/magic-link` to send dual-link email (HTTPS for Android/desktop, `bluefy://...` for iPhone)
3. If it doesn't work or BLE notifications are unreliable on Bluefy: explicitly drop iPhone support in V.0 docs, route iPhone riders to a laptop with Chrome
4. If Bluefy notifications are reliable but URL scheme isn't: keep manual copy-paste flow, but add a "Copy URL for Bluefy" button on the Safari-rendered logged-in page that one-taps the URL to clipboard

Either way: the decision is made based on actual device testing, not speculation.

### IndexedDB offline buffer enhancements (iOS-specific)

V.0 implements quota-aware offline buffering with warning at 80%, hard stop at 90% (per `web/03-pwa-band-pairing.md`). This prevents silent data loss but means iPhone riders in extended-offline scenarios will see "buffer full" errors after ~3-4 unsynced sessions.

Fix path for V.0.1:

1. **Compression** — gzip sample batches before queuing. Typical 3-5× reduction. Easy win, ~50 lines of code.
2. **Storage chunking** — when IDB exceeds 10 MB, upload the whole queue as a single Parquet/JSON blob to Supabase Storage, return a Storage reference, clear the IDB queue. Algo service ingests from Storage on next compute.
3. **Background Sync** — wishlist; Apple does not support `periodicSync` on iOS so this only works on Android Chrome. Document as Android-only enhancement.

Trigger to do this: first iPhone rider hits the buffer-full error in real conditions, OR a session is lost due to buffer constraints. Until then, V.0's quota-aware approach is sufficient.

### Other V.0.1 candidates

- Bearer token rotation (low priority, no time pressure)
- Down migrations for existing 001-011 (when first schema rollback is needed)
- Algo "compute retry" admin button (when first stuck job appears)

## Pre-paper checklist (before any publication)

If you publish a paper using V.0 data, do these first:

- [ ] IE thesis supervisor reviews data collection consent
- [ ] Down migrations exist for the schema state used
- [ ] Pinned algo_version recorded for every metric in the paper
- [ ] Export manifest committed to repo (per `shared/06-data-export.md`)
- [ ] Anonymization pass on rider data
- [ ] Reviewed by at least one external sport scientist for methodology

These aren't engineering items but they're V.1 quality gates that block paper submission.

## How to reactivate items from this backlog

- When V.1 commercial launch decision is made → review this file end-to-end
- When a specific incident maps to one of these items → fix that one, mark resolved here
- When team grows beyond 2 people → reactivate "secrets manager" and "audit log"
- When dataset hits 10K+ sessions → reactivate "cursor pagination" and "load test"

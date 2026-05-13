# 05 · Build Plan

> Canonical V.0 build plan. **20 slices in 6 phases**, ~108 hrs / 4–5 weekends. Each slice is human-testable in <10 minutes and ends with verified working state — never with "you'll need to set up X."
>
> Every slice has a kill switch. If a slice exceeds **1.5× its estimate**, fall back to the listed switch rather than extending. 17 working slices > 18 half-finished ones.

---

## Phasing at a glance

| Phase | Slices | Goal | Hrs | Milestone |
|---|---|---|---|---|
| **0 — Pre-flight** | 0 + accounts | PMD codec spike (1-hr cap) + domain/repos/hello-world deploys | ~3 | Go/no-go on Slice 12 budget |
| **1 — Foundation** | 1, 2, 3, 4 | Bearer round-trip + schema + magic-link auth + sessions API | ~13 | Sign-in works on phone |
| **2 — First smoke** | 5, 6, 7 | BLE pair → ingest → record-on-self | ~16 | **Smoke test on Ferdinand's chest** |
| **3 — Compute** | 8, 9, 10, 11, 11.5 | V.0.1 migrations + algo + cron runner + TRIMP + recovery τ | ~21 | **HRV row appears in DB** |
| **4 — Full sensors** | 12, 13, 14 | PMD codec (ACC + ECG) + gait detection (RF on Kamminga + H10) + stress test | ~20–28 | **ECG/ACC flow + RF classifier + stress test** |
| **5 — Review + admin** | 15.A, 15.B, 16, 16.5 | Manual label review UI + admin dashboard + anomaly-rest | ~19 | Rider reviews <60s |
| **6 — Production gate** | 17, 18 + first-on-horse | Multi-rider RLS + Realtime auth + iPhone + Service Worker + on-horse verification | ~11 | **Stable-trip ready** |

**Critical-path chain:** 1 → 2 → 3 → 4 → 5 → 6 → 7 [SMOKE] → 8 → 9 → 10 [COMPUTE] → 12 → 13.

Slices 16, 17, 18 can run **parallel** to the algo path on weekend 2–3 evenings.

---

## Phase 0 — Pre-flight (~3 hrs)

### Pre-flight chores (~2 hrs, not a slice)

- Buy `lafattoria.app` domain (Cloudflare or Namecheap, ~€15)
- Create accounts: Vercel, Supabase, Railway, GitHub (✓ done — `github.com/Rapixx19/Polar-Equine-`)
- Generate algo bearer token (32 bytes, base64url); store in 1Password / similar
- Connect Vercel to the monorepo with **root directory = `web/`**
- Connect Railway to the monorepo with **root directory = `algo/`**
- (Optional) rename `Polar-Equine-` → `polar-equine` to drop trailing hyphen; GitHub auto-redirects

### Slice 0 — PMD codec spike (1 hr cap)

**Goal:** Decide whether to vendor a community JS port of the Polar PMD frame decoder, or write from spec.

**Done when:** One of:
- (a) **Found:** clean repo identified (MIT/Apache/BSD), vendored into `lib/ble/pmd/` with attribution. Slice 12 estimate stays at 8 hrs.
- (b) **Not found:** no permissive port exists. Slice 12 estimate doubles to 16 hrs and becomes a full weekend day.

Reference resources:
- Source of truth: `github.com/polarofficial/polar-ble-sdk/tree/master/technical_documentation` (PMD spec PDF)
- Reference logic, **DO NOT copy code** (GPL-3.0 incompatible): `cjs30/FingerPulseLatency`, `fsmeraldi/bleakheart` (Python)

**Kill switch:** Hard 1-hour cap. Don't research-rabbit. If undecided at 60 min, default to "not found" and budget 16 hrs for Slice 12.

**Slice 0 outcome (recorded 2026-05-02):** **(b) Not found.** Slice 12 = 16 hrs. Total project ~108 hrs.

---

## Phase 1 — Foundation (~13 hrs)

### Slice 1 — Monorepo skeleton + bearer round-trip + CI + local dev (~3 hrs)

**Goal:** Single repo (`Polar-Equine-`) holds `web/` (Next.js) and `algo/` (FastAPI). `lafattoria.app` serves a Next page from `web/`; `algo.lafattoria.app/health` returns 200 from `algo/`; web → algo POST with bearer succeeds, fails without.

**Final layout after this slice:**

```
Polar-Equine-/
├── README.md                 # top-level: who does what, where to start
├── .cursorrules              # session-start rules (already drafted)
├── .gitignore
├── .github/
│   └── workflows/
│       ├── web-ci.yml        # paths: ['web/**']
│       └── algo-ci.yml       # paths: ['algo/**']
├── docs/                     # ← move lafattoria-docs/ here
├── web/
│   ├── app/(auth)/page.tsx          # placeholder welcome
│   ├── app/api/_smoke/route.ts      # proves web→algo call
│   ├── public/manifest.json         # PWA manifest stub
│   ├── public/sw.js                 # Service Worker stub
│   ├── lib/api-client.ts            # bearer-token wrapper
│   ├── package.json  tsconfig.json  next.config.js  vercel.json
│   └── supabase/migrations/         # empty for now; Slice 2 fills it
├── algo/
│   ├── README.md             # ← FREELANCER ENTRY POINT (write the skeleton)
│   ├── service/main.py       # FastAPI app
│   ├── service/auth.py       # bearer-token check
│   ├── algorithms/version.py # algo_version constant ("0.1.0")
│   ├── algorithms/__init__.py
│   ├── tests/test_health.py
│   ├── pyproject.toml
│   └── railway.toml
└── scripts/                  # empty for now; verify-slice-7.sql lands later
```

**Includes (gap-fixes folded in):**
- **Path-filtered CI in `.github/workflows/`:**
  - `web-ci.yml` triggers on `web/**` only — runs `tsc --noEmit`, `vitest`, `eslint`
  - `algo-ci.yml` triggers on `algo/**` only — runs `mypy --strict`, `pytest`, `ruff`
  - Both block merges on red
- Supabase CLI installed locally (`brew install supabase/tap/supabase`)
- `supabase init` inside `web/` + local Postgres workflow documented in `web/README.md`
- `web/public/manifest.json` + `web/public/sw.js` stubs (full SW lands in Slice 18)
- `.cursorrules` at repo root only (one source of truth, both sub-trees see it)
- `algo/README.md` skeleton — sets up the freelancer entry point even before there are algorithms

**Vercel + Railway root-path config:**
- Vercel: project root = `web/`. Build command = `npm run build`. Output = `.next`.
- Railway: project root = `algo/`. Build command from `pyproject.toml`. Start = `uvicorn service.main:app`.

**Done when:**
- `curl https://algo.lafattoria.app/health -H "Authorization: Bearer $TOKEN"` → 200
- Same curl without bearer → 401
- Web `/api/_smoke` route proves it can call algo with bearer
- Editing a file under `web/` triggers ONLY `web-ci.yml`; editing `algo/` triggers ONLY `algo-ci.yml` (verify in Actions tab)
- `cd web && supabase start` runs a local Postgres
- Both deployments green; both CIs green for the initial commit

**Kill switch:** If Railway cold-start latency > 5s, switch algo deploy to Fly.io (specced in README as backup). Don't burn a day on Railway.

### Slice 2 — Migrations 001–007 + RLS + type generation (~2 hrs)

**Goal:** Base schema in production Supabase. RLS policies attached. CHECK constraints on activity types match `lib/activities.ts`. TypeScript types generated.

**Done when:**
- All 7 base tables exist
- `select * from pg_policies` shows expected RLS rows
- As an authenticated user: can `select` from `rider_profiles`; cannot as anon
- `supabase gen types typescript --project-id eehbdrqueinqmocmjydy > lib/supabase/types.ts` runs and the result is committed
- A standing pre-commit hook (or documented step) re-runs type generation after every migration

**Kill switch:** If any migration fails on Supabase Cloud (vs local), drop the project, recreate, re-apply. Don't debug. Cost: 30 min.

### Slice 3 — Magic-link auth + rider_profiles row + consent capture (~5 hrs)

**Goal:** Type email on phone → tap link in inbox → land in PWA logged in → `rider_profiles` row created with `consented_at = now()` if checkbox ticked.

**Done when:**
- Cookie persists 90 days
- `rider_profiles` row exists for the test user
- `consented_at` column is non-null
- Tested on actual phone (not just desktop)

**Kill switch:** If Supabase Auth magic links don't deliver to your inbox in <30s, fall back to email/password for V.0 dev (mark in `V1_BACKLOG.md` to fix). Don't lose a day to deliverability.

**Note:** Consent checkbox is the IRB hedge. If ethics board rejects later, you have provable consent timestamps. Cheap insurance.

### Slice 4 — Sessions API (no samples yet) (~3 hrs)

**Goal:** `POST /api/sessions` creates row; `PATCH /api/sessions/[id]` with `action=end` marks completed. Activity type validated against the 7-type list. Idempotency key honored.

**Done when:**
- Two integration tests pass:
  1. Create + end happy path
  2. Duplicate idempotency key returns 200 OK with the same session row (Rule 12), not 500

**Kill switch:** None needed — straightforward CRUD.

---

## Phase 2 — First smoke (~16 hrs)

### Slice 5 — BLE pairing + HR notification decode (~6 hrs)

**Goal:** Strap H10 to your chest, tap "Connect" in PWA, see live HR + R-R intervals updating in console. Works on Chrome Android. Tested in Bluefy on iPhone — note any issues.

**Done when:**
- HR characteristic `0x2A37` decodes correctly (HR + R-R ms array)
- Live updates < 1s lag
- Bluefy verified or iPhone gap explicitly documented

**Kill switch:** If Bluefy notifications fail on iPhone (the unverified 2023 issue), continue Android-only and slot iPhone fix into Slice 18. Don't block the smoke test on iOS.

### Slice 6 — Ingest API + 2s batcher + RLS verified (~5 hrs)

**Goal:** HR samples flow phone → batcher → `/api/ingest/samples` → `samples_hr` table. RLS prevents rider B from reading rider A's samples.

**Done when:**
- 5-min HR stream produces ~300 rows in `samples_hr`
- A second test user's `select` returns zero rows for the first user's session

**Kill switch:** If RLS proves harder than expected, ship slice 6 with policy enabled but full multi-rider assertion deferred to Slice 17. Add a TODO in code, not a hidden bug.

### Slice 7 — Recording UI + first end-to-end smoke test (~5 hrs)

**🎯 SMOKE TEST POINT — the QUICKSTART promise.**

**Goal:** Welcome → email → magic link → vitals home → connect H10 → start session → record 5 min → end → see "saved" confirmation.

**Done when ALL of these are true:**

1. Exactly one row in `sessions` with `status='completed'` and `end_time IS NOT NULL`
2. ≥ 250 rows in `samples_hr` for that session_id (5 min × ~1 Hz, floor accounts for missed beats)
3. All `hr_bpm` values in [30, 220] (catches sensor garbage)
4. No two consecutive sample timestamps with gap > 5s (catches BLE dropout the batcher silently swallowed)
5. One row in `rider_profiles` with `consented_at IS NOT NULL`
6. Screenshot of Supabase dashboard saved to `/proof/slice-7/`

**Verification query** (`scripts/verify-slice-7.sql`, run as part of acceptance):

```sql
with s as (select id from sessions order by created_at desc limit 1),
     gaps as (
       select max(t_ms - lag(t_ms) over (order by t_ms)) as max_gap_ms
       from samples_hr where session_id = (select id from s)
     )
select
  (select count(*) from sessions
     where id = (select id from s) and status='completed' and end_time is not null) as session_ok,
  (select count(*) from samples_hr where session_id = (select id from s)) as sample_count,
  (select min(hr_bpm) from samples_hr where session_id = (select id from s)) as hr_min,
  (select max(hr_bpm) from samples_hr where session_id = (select id from s)) as hr_max,
  (select max_gap_ms from gaps) as max_gap_ms,
  (select count(*) from rider_profiles where consented_at is not null) as consent_ok;
```

Expected: `session_ok=1, sample_count>=250, hr_min>=30, hr_max<=220, max_gap_ms<=5000, consent_ok>=1`. Anything else = smoke test failed; fix before declaring slice 7 done.

**Kill switch:** If anything from Slices 1–6 wasn't truly done, Slice 7 will expose it. Treat the first failed smoke test as expected. Budget a full half-day for debug.

---

## Phase 3 — Compute pipeline (~21 hrs)

### Slice 8 — V.0.1 hardening migrations + idempotency wiring (~4 hrs)

**Goal:** Migrations 008–011 applied. `compute_jobs`, idempotency keys on ingest, `last_ingest_at` for stale detection, `label_corrections`, `anomaly_flags` schema.

**Done when:** Re-running Slice 7's smoke test:
- Duplicate POST is rejected with 409
- Stale-session cleanup function exists and runs on cron stub

**Kill switch:** None. These are purely additive.

### Slice 9 — Algo service skeleton + RR cleaning + HRV (~6 hrs)

**Goal:** FastAPI app on Railway with `/compute` endpoint, bearer auth, neurokit2 + scipy installed. Given a synthetic R-R array, returns RMSSD + SDNN + quality score.

**Includes (gap-fixes):**
- `algo_version` constant in algo repo (`algo/version.py`); every metric write tags this version
- `requirements.txt` pins Python 3.11 + neurokit2 + scipy + numpy versions
- One reference test against a PhysioNet RR fixture in addition to synthetic

**Done when:**
- pytest fixture passes
- `curl algo.lafattoria.app/compute -d @fixture.json` returns expected metrics
- PhysioNet RR sanity-check produces RMSSD within 5% of published value
- Python 3.11 + neurokit2 versions pinned in `requirements.txt`

**Critical:** Define `_quality_score()` formula here, since spec doesn't:
`quality = 1.0 - (n_corrected / n_total)`, floor at 0. Document it. Land a Markdown patch back to `algorithms/02-rr-cleaning.md`.

**Kill switch:** If neurokit2 + Python 3.11 incompat surfaces, downgrade to Python 3.10 immediately. Don't fight package compatibility. Document the pin in `shared/01-environment-variables.md`.

### Slice 10 — Compute job runner (Vercel cron + dispatch) (~5 hrs)

**🎯 FIRST COMPUTE.**

**Goal:** Session end enqueues `compute_jobs` row. Vercel cron at 1-min interval picks pending jobs, POSTs to algo `/compute`, writes `session_metrics` row, marks job complete.

**Includes (gap-fixes):**
- `CRON_SECRET` env var; `/api/cron/*` endpoints validate header before work
- `vercel.json` sets `maxDuration: 60` for `/compute-runner`

**Done when:**
- Re-run Slice 7's smoke test → wait 1 min → metrics row appears with valid HRV
- A failed job retries once, then marks `metrics_status='failed'` (not silent zero)
- `curl /api/cron/compute-runner` without `CRON_SECRET` header → 401

**Kill switch:** If Vercel cron 1-min granularity is unreliable, switch to GitHub Actions cron or Supabase `pg_cron` extension. Both specced as fallbacks.

### Slice 11 — TRIMP + HR zones (~3 hrs)

**Goal:** Per-session TRIMP, time in HR zones (Z1–Z5). Added to `session_metrics`.

**Done when:** pytest passes; admin (when it exists) would see real numbers.

**Kill switch:** TRIMP is well-defined math. If neurokit2 doesn't have it, write 30 lines of Python from the Banister formula. Don't pull a new dependency.

### Slice 11.5 — Recovery τ (~3 hrs)

**Goal:** Post-exercise HR-decay fit per `algorithms/04-recovery-tau.md`. Exponential decay on cool-down window, returns τ in seconds + R² fit quality.

**Done when:**
- Pytest fixture (synthetic decay curve) returns τ within 5% of ground truth
- `session_metrics.recovery_tau_s` populated for completed sessions

**Kill switch:** `scipy.optimize.curve_fit` is well-trodden. If R² consistently <0.7 on real data, mark `recovery_tau` nullable and continue. Don't fight noisy fits.

### Slice 11.75 follow-up — capture-quality threshold calibration

`WEAK_CORRECTION_RATE = 0.05` in `web/lib/ble/capture-quality.ts` is a starting value. Verified against still-sit (clean) and walk+sit on a human chest (88% good, expected). **Not yet calibrated against rider-on-horse motion.** After ≥3 real rider-on-horse sessions land in production, retrospectively review badge state and tune per Task 5.4 step 3 of the slice plan (`docs/superpowers/plans/2026-05-05-slice-11.75-bluefy-ux.md`). Threshold is not load-bearing; do not treat 0.05 as canonical.

### Slice 11.8 — PWA polish (deferred from Slice 11.7)

- PWA icons (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) and cleanup of unused Next.js boilerplate SVGs in `web/public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`).

---

## Phase 4 — Full sensors (~14–22 hrs)

### Slice 12 — PMD codec (ACC + ECG) (~16 hrs, doubled per Slice 0 outcome)

**Goal:** PMD service subscribed, binary frame format decoded, ACC and ECG samples land in `samples_acc` / `samples_ecg`. ECG at 130 Hz, ACC at 52 Hz.

**Done when:** 5-min session produces ~15,600 ACC rows × 3 axes and ~39,000 ECG rows.

**Kill switch:** If after 16 hrs the frames don't decode cleanly, downgrade to HR-only V.0 and defer ACC/ECG to V.0.1. The thesis can publish on HR alone if it has to.

**Heaviest slice in the plan.** Budget a full weekend day. Reference `bleakheart` (Python) and `cjs30/FingerPulseLatency` (HTML) for sanity checks — **read only, do not copy** (GPL-3.0).

### Slice 13 — Gait detection (~12 hrs, was ~6)

**Goal:** Ship the v0 gait classifier specified in `algorithms/06-gait-detection.md` (rewritten 2026-05-12). Random-Forest classifier on hand-engineered features from 200 Hz tri-axial ACC, downsampled to 50 Hz internally, 2-second windows with 50% overlap. Outputs `gait_segments` rows: halt / walk / trot / canter / mixed plus a separate jump detector.

**Why doubled:** Prior 6-hr estimate assumed a single-band threshold classifier on 52 Hz accel. The literature review (Sageder 2025, Kamminga 2019, Rana & Mittal 2025) showed that approach ceilings well below thesis-defensible accuracy. The honest ~12 hr scope buys an RF trained on the public Kamminga dataset, transferred to H10 chest-girth, with a documented validation plan.

**Done when:**
- `algo/algorithms/gait.py` + `gait_features.py` + `gait_jump_detector.py` implement the pipeline in the spec (anti-alias → 200→50 Hz → bandpass → magnitude → window → ~15 features → RF → majority smoothing → segments).
- `algo/scripts/train_gait_rf.py` trains on the Kamminga "Horsing Around" CC0 dataset (`fetch_kamminga.sh` downloads it) and produces `algo/models/gait_rf_v0.1.joblib`.
- Held-out-horse cross-validation in `test_gait_kamminga.py` hits **≥ 78% balanced accuracy** on walk / trot / canter.
- Self-recorded H10 chest-girth session (one rider, one horse, one short ride mixing walk / trot / canter) labels ≥ 70% of windows correctly when compared against rider quick-labels from Slice 15.

**Kill switch:** If Kamminga validation falls below 70% balanced accuracy, downgrade `gait.py` to a binary "moving / not moving" classifier on accel magnitude, mark full gait classification as Luigi-track work, riders hand-label everything via Slice 15. Document the failure honestly in the thesis methods chapter.

**Pre-req for freelancer (Luigi) work:** This slice ships the v0 baseline. The M1 contract gate is whether Luigi can beat v0's balanced accuracy on rider-labeled H10 data with at least the same level of interpretability.

**File budget (eight files, all ≤150 lines except the joblib model + frozen eval fixture):** `gait.py`, `gait_features.py`, `gait_jump_detector.py`, `train_gait_rf.py`, `fetch_kamminga.sh`, `gait_rf_v0.1.joblib`, `test_gait_synthetic.py`, `test_gait_kamminga.py`. The spec file's own 150-line rule is satisfied by the helpers split — `06-gait-detection.md` itself documents the contract.

### Slice 14 — Stress test (~4 hrs)

**Goal:** Run a 100-session synthetic insert script against a **staging** Supabase project (not prod). Watch fill curve at 25 / 50 / 75 / 95 sessions. Confirm 80% alert fires.

**Done when:** Written observation of:
- (a) actual storage per session in prod conditions
- (b) at what session count the 80% alert triggered
- (c) any RLS or constraint failures the script exposed

**Kill switch:** If the script borks the staging project, drop the project and skip. The exercise has already taught you where the bugs are. Don't burn time perfecting it.

**Critical:** This slice creates the spec file `shared/13-stress-test.md` that doesn't exist yet. Land it back into the doc tree.

---

## Phase 5 — Review + admin (~17 hrs)

### Slice 15 — Manual label review UI (~9 hrs, split 15.A + 15.B)

**Decoupled from Slice 13.** Per the Option C labelling decision, this slice is manual-only — no auto-label dependency. Slice 15 can ship before Slice 13 and the resulting `label_corrections` rows become ground truth for both the v0 RF classifier (Slice 13) and the freelancer's follow-up model.

**Interaction model (locked):** Pre-segmented time blocks, tap each with a label chip. Long-press to subdivide. Jump counts captured per-block in the same chip sheet — this gives the freelancer block-level alignment between rider ground truth and accel impulse signatures, which a session-total count would not.

**Block count:** `min(8, max(4, round(duration_min / 6)))`, equal time slices. HR-breakpoint segmentation is a 15.5 enhancement if riders report block boundaries straddling gait changes.

**Re-edit window:** Rider can edit labels until 23:59:59 local time of the session date. API rejects edits after midnight. No DB column needed — derive from `session.created_at` + rider timezone. Memory-fresh labels are the point; late-evening sessions get a 15.5 push-notification nudge if it becomes a real complaint.

**Entry point:** "Needs review" badge on the home page. No auto-redirect after compute completes — riders may want to glance at HR first.

#### Slice 15.A — Manual block labels + approve (~6 hrs) — ✅ **shipped 2026-05-13** (PR #29)

**Shipped state** (any divergence from the original spec below is intentional):
- Migration **022** (`label_corrections` jump-count columns + `manual` correction_kind) + **025** (re-grant `is_admin_check()` EXECUTE — fixes RLS regression from migration 008) + **026** (admin UPDATE policy on `rider_profiles`).
- Edit window changed from "23:59:59 local time" → **24h from `sessions.created_at` (UTC)** because no `rider_profiles.timezone` column exists yet.
- HR mini-trace **dropped** from 15.A; no HR-samples API or chart component existed. Will land in Slice 16 (admin dashboard, where Recharts is already planned).
- Files actually shipped: see `web/04-pwa-label-review.md` (the doc was rewritten to match).
- Bonus shipped in the same PR: research dashboard (Slice 14 prep), `/admin` riders page with editable quotas, theme swap to white/black palette, deletion of obsolete `/session/new/subtype` + `/custom` pages.

**Original goal (verbatim, for the freelancer's context):** Rider opens a computed session, sees 4–8 time blocks, taps each to pick a label (`halt / walk / trot / canter / jump / not sure`) and a per-block jump count, hits Approve. Writes `label_corrections` rows + flips `sessions.status='approved'`.

**Done when:**
- Migration `02X_label_corrections.sql` ships: `(id, session_id, rider_id, start_ms, end_ms, label, jump_count INT DEFAULT 0, created_at)` + RLS (rider reads/writes own, admin reads all).
- `POST /api/sessions/[id]/labels` validates ownership, validates midnight window, writes rows + status flip in one transaction.
- `<NeedsReviewBadge>` on `/home` links to `/sessions/[id]/review` when an unreviewed computed session exists.
- Self-test on Ferdinand's iPhone via Bluefy: label a 42-min session in **≤60s**, hit Approve, verify rows in DB + status flip.
- Unlabeled approve attempts are rejected with a clear "label at least one block" error.

**Kill switch:** If any component breaks the 150-line rule, split as already planned (`TimelineSegments` / `LabelChipSheet` / `ReviewClient`). If gesture handling on Bluefy fights the build for >2 hrs, ship aggregate-only mode (one chip: "this session was mostly walk/trot/canter") — coarser ground truth, documented as regression, restored in 15.B.

**Files (10, all ≤150 lines):**
```
db/migrations/02X_label_corrections.sql              — schema + RLS
web/app/api/sessions/[id]/labels/route.ts            — POST/GET, midnight check
web/app/sessions/[id]/review/page.tsx                — server: fetch session + HR trace
web/app/sessions/[id]/review/ReviewClient.tsx        — top-level state machine
web/app/sessions/[id]/review/TimelineSegments.tsx    — block grid
web/app/sessions/[id]/review/LabelChipSheet.tsx      — bottom sheet: label + jump counter
web/app/sessions/[id]/review/HRMiniTrace.tsx         — readonly chart context
web/app/sessions/[id]/review/segments.ts             — block math (pure fn)
web/app/home/NeedsReviewBadge.tsx                    — entry point
web/tests/sessions-review.test.ts                    — segment math + API contract
```

#### Slice 15.B — Long-press split + Bluefy polish (~3 hrs)

**Goal:** Power users subdivide a block via long-press (500 ms) → "split in half / split in thirds." Bluefy-specific touch-event quirks resolved (text-selection magnifier suppressed, context menu prevented).

**Done when:**
- Long-press on a block opens `<SplitBlockSheet>`; selecting an option replaces the block with 2 or 3 unlabeled children.
- Bluefy on iPhone: long-press does NOT trigger Safari's selection magnifier.
- Ferdinand self-tests on Bluefy + Chrome Android + desktop Safari before merge.

**Kill switch:** If long-press is unreliable on Bluefy, ship a small "+" icon on each block instead — less elegant but deterministic across webviews.

**Files (2):**
```
web/app/sessions/[id]/review/SplitBlockSheet.tsx     — split options
web/app/sessions/[id]/review/segments.ts             — extend with split logic (still ≤150)
```

**Why the split into 15.A + 15.B:** 15.A is the minimum-viable ground-truth capture. Even if 15.B is never built, the freelancer has block-level labeled data to train against. 15.B is pure UX polish for power users.

### Slice 16 — Admin dashboard (Today + sessions list + session detail) (~7 hrs)

**Goal:** Admin user (your account, `is_admin=true`) sees:
- Today's active sessions live
- All sessions list with filters
- Session detail with HR trace + gait timeline + metrics

**Includes (gap-fix):** Time-zone display — `timestamptz` stored UTC, admin renders in browser-local time using `toLocaleString()`.

**Done when:** Drill from list → detail → see real session data from your smoke test.

**Kill switch:** If Recharts is a fight, ship session detail with a simple HTML table for V.0. Pretty charts can wait for V.0.1.

### Slice 16.5 — Anomaly-rest (~3 hrs)

**Goal:** Per `algorithms/08-anomaly-rest.md`. Flag rest sessions where HR or HRV deviate from per-horse baseline by >2σ. Writes to `anomaly_flags` table.

**Done when:** Synthetic baseline + anomalous rest session triggers a flag visible in admin detail view.

**Kill switch:** Requires ≥5 baseline rest sessions per horse to be meaningful. If you don't have that data by build time, ship the algo but accept that flags won't fire until enough data lands. Document the threshold.

---

## Phase 6 — Production gate (~11 hrs)

### Slice 17 — Compliance + security gate (~5 hrs)

**Goal:**
- RLS verified with two real test users on two real phones
- `compute_jobs` RLS policy added
- Realtime publication restricted to authenticated subscribers seeing only their own rows
- GDPR data export endpoint works

**Done when:**
- Test rider B (logged in on phone B) cannot see test rider A's session
- B cannot subscribe to A's realtime channel
- `GET /api/me/export` returns a JSON dump of A's data only

**Kill switch:** If Supabase Realtime row-level auth is unclear from docs, disable Realtime for V.0 and use polling on the recording screen. Better than leaking. Document in `V1_BACKLOG.md`.

**Critical:** This slice generates the missing spec files for `compute_jobs` RLS and Realtime authorization. Land them in `update_further/docs/lafattoria-docs/`.

### Slice 18 — Onboarding polish + iPhone universal links + Service Worker (~6 hrs)

**Goal:**
- First-run rider sees a clean welcome flow
- iPhone universal links route the magic-link tap to the PWA, not Safari
- Service Worker caches shell + holds passive HR stream queue when screen locks

**Done when:** Onboard the head trainer end-to-end on her iPhone or Android in <5 min, including consent. Stable trip is unblocked.

**Kill switch:** If Service Worker passive stream proves complex, ship V.0 without passive stream. Riders manually start sessions. Note in QUICKSTART that iOS background BLE has known V.0 limits.

**Critical:** This slice generates the missing Service Worker spec file. Land it.

**Deferred from Slice 11.75 — D (BLE auto-reconnect on disconnect events)**

Restore the BLE GATT connection automatically when notifications stop unexpectedly mid-session. Surface a "reconnecting…" banner; resume sample stream on reconnect.

**Prerequisite: real-flake test environment.** Cannot be reliably tested in dev — BLE flakes happen on real horses during real rides, not on a desk. Defer until either (a) we have ≥10 production sessions where BLE drops actually occurred (so we can study the failure modes) or (b) we build a flake-injection test harness (e.g., a synthetic BLE source that drops notifications on cue).

### First-on-horse verification (~1 hr, post-Slice 18, before stable trip)

**Goal:** Confirm H10 Equine actually works on a horse, not just on a human chest. Risk: ECG amplitude, R-R range, ACC signature on a horse differ from human; might unmask decoder bugs that passed Slice 7.

**Done when:**
- One short session strapped to a horse (any horse, any context)
- HR values land in horse range (28–45 bpm rest, 80–200 bpm work)
- ACC magnitudes are in expected range (no obvious clipping)
- ECG (if Slice 12 shipped) shows recognisable QRS complexes

**Kill switch:** If something looks off, **do not** drive to the stable trip. Diagnose first. The cost of one extra evening of debug is far less than a failed first session in front of the trainer.

---

## After V.0

| Time | Action |
|---|---|
| Week 4 | Onboard additional riders, expand to multiple horses being logged |
| Week 5–8 | Field study runs — 50+ sessions per week |
| Week 8 | Algorithm freelancer starts implementing additional algorithms (`algorithms/04`, `08`) |
| Week 12 | First thesis chapter draft, first paper outline |
| Week 16 | V.1 hardware spec finalized with Prototipalo using V.0 data |
| Month 6 | Submit paper to Equine Veterinary Journal |
| Month 8 | V.1 hardware ships, software upgrade weekend |
| Month 12 | Approach FEI through federation contacts |

---

## Slice dependency graph

```
1 → 2 → 3 → 4 → 5 → 6 → 7 [SMOKE]
              ↓
              8 → 9 → 10 [COMPUTE] → 11 → 11.5
                          ↓
                          12 → 13 → 15
                                ↓
                                14 [STRESS]

              16   (parallel after 10)
              16.5 (parallel after 16)
              17   (parallel after 6)
              18   (parallel after 7)

              first-on-horse (sequential, after 18)
```

If you have evening time during weekends 2–3, work Slices 16, 17, 18 in parallel with the algo path.

---

## Honest unknowns (estimate variance)

These are slices where the time estimate could be wrong by an unknown amount, in either direction:

1. **Slice 12 (PMD codec).** Could be 2 hrs or 16. Per Slice 0 outcome, budgeted at 16.
2. **Slice 5 (Bluefy iOS reliability).** The 2023 GitHub issue is unresolved. Could be a non-issue or a multi-day debug.
3. **Slice 10 (first Vercel cron run).** Cron + serverless cold-start interactions are flaky on first deploy.
4. **Slice 17 (Realtime authorization).** Supabase Realtime RLS is documented but unverified in our setup.
5. **Slice 9 (neurokit2 install on Railway).** scipy + numpy compile-from-source on minimal containers is a known Railway pain point.

If any of these explode, the slices around them slip by 0.5–1 weekend. The kill switches are designed so that worst case = ship a degraded V.0, not no V.0.

---

## Open questions to resolve before / during build

These are the seven open questions from the Phase 1 audit. Defaults are in effect; if any are wrong, slot order shifts but slice content doesn't.

| # | Question | Default assumption | Affected slices |
|---|---|---|---|
| 1 | iPhone for testing | Available | 5, 18 |
| 2 | Storage upgrade trigger | Hit the wall. 80% = log only. 95% = stop ingest. | 14 |
| 3 | IRB timeline | In progress, ~6 weeks out. Capture consent from day 1. | 3, 17 |
| 4 | Algorithms | Ferdinand writes in V.0; freelancer improves later | 9, 11, 11.5, 13, 16.5 |
| 5 | Stable deployment hard date | Float — when smoke test passes on yourself | post-18 |
| 6 | PMD codec source | Write from spec (Slice 0 outcome) | 12 |
| 7 | Second test rider for RLS | Borrow phone for one Day-1 session | 17 |

---

## Status checkpoints

After each phase, the human (Ferdinand) confirms by ticking these:

- [ ] **Phase 0 complete** — Slice 0 decision recorded, hello-world deploys live
- [ ] **Phase 1 complete** — Sign-in works on phone, API rejects unauth requests
- [ ] **Phase 2 complete** — 🎯 Slice 7 smoke test passed on Ferdinand's chest
- [ ] **Phase 3 complete** — 🎯 First HRV row visible in DB after a session
- [ ] **Phase 4 complete** — 🎯 ECG/ACC rows + stress-test report
- [ ] **Phase 5 complete** — Admin can drill list → detail with real data
- [ ] **Phase 6 complete** — 🎯 Stable-trip ready, first-on-horse verified

Don't tick a phase until every slice in it is fully done and verified by the human.

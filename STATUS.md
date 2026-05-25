# STATUS — Polar-Equine- (Sentavita / La Fattoria)

> Single-page snapshot of what's shipped, what's still pending, and where the open risks sit. Updated **2026-05-25**.
>
> Authoritative slice plan lives in [`docs/05-build-plan.md`](docs/05-build-plan.md). This file is the rollup view.

---

## At a glance

| Phase | Slices | State | Evidence |
|---|---|---|---|
| **0 — Pre-flight** | 0 + accounts | ✅ done | Slice 0 outcome recorded 2026-05-02: PMD spec, no permissive port → 16-hr Slice 12 budget |
| **1 — Foundation** | 1, 2, 3, 4 | ✅ done | Migrations 001–007, magic-link auth, sessions API, `/api/_smoke` round-trip |
| **2 — First smoke** | 5, 6, 7 | ✅ done | `proof/slice-9`, `proof/slice-10` artifacts; H10 + ingest + `/record` end-to-end |
| **3 — Compute** | 8, 9, 10, 11, 11.5 | ✅ done | algo 0.7.0 live on Railway; HRV + TRIMP + recovery τ + compute_jobs cron |
| **4 — Full sensors** | 12, 13, 14 | ⚠️ partial | PMD codec ✅ (PRs #31, #36–43), Slice 13 gait v0.1 ✅ (PRs #34, #50). **Slice 14 stress test not run.** |
| **5 — Review + admin** | 15.A, 15.B, 16, 16.5 | ⚠️ partial | 15.A ✅ (PR #29), admin dashboard ✅ (PRs #47, #49, #51, #55). **15.B long-press + 16.5 anomaly-rest not built.** |
| **6 — Production gate** | 17, 18 + first-on-horse | ⚠️ partial | Slice 17 GDPR + Realtime audit ✅ (PR #52). **Slice 18 iPhone universal links + SW passive stream + first-on-horse pending.** |

**Headline:** V.0 spec is ~85% shipped. The gap is field-validation (first-on-horse, stress test) and iOS polish — *not* core data pipeline.

---

## What's shipped beyond the original slice plan

Pulled forward from V.0.1 / V.1 backlog as the build evolved:

| Theme | Where | Why |
|---|---|---|
| **Per-horse HR calibration** (mig 038) | PR #58 | Species-default 225/32 buried working HR below Z1 floor — calibration unlocks meaningful TRIMP |
| **HRV plausibility gate preserves data** | PR #59 | Don't null HRV when noise trips — flag and keep, per `feedback_horse_data_is_noisy` |
| **Live in-ride gait label chips** | PRs #53, #56 | Rider taps the current gait while riding → precision ground truth for Slice 13's RF retraining |
| **Live admin tracking of active sessions** | PRs #51, #55 | Trainer dashboard reflects what's happening in the arena now, not only after the ride |
| **Per-horse research objectives + KPIs** | PR #49 | Surface programme-level progress alongside per-session metrics |
| **Signal-quality events + summary banner** | PRs #44, #60 | Capture weak/lost BLE windows; admin sees them collapsed in session detail |
| **Prototype mount comparison** | PR #45 | Tag sessions with prototype-girth-mount, Claude verdict on side-by-side data quality |
| **Android pre-session guard + foreground warnings** | PRs #61, #62 | Connection-resilience — Wake Lock, BLE auto-reconnect, drop badge, Unrestricted-battery prompt |
| **Recovery-upload endpoint** | PR #63 | Admin can resubmit raw CSV if a session's PWA crashes mid-ride — preserves raw-data invariant |
| **Session-kind chip picker + voice notes + jump-gate** | PR #64 (open) | Rider classifies the ride at end; algo gates jump-detection on `riding_subtype` |

---

## What's still pending

### Blocking the current PR
- **Migration 037 (`sessions.kind_id`)** — SQL in `web/supabase/migrations/037_session_kind_id.sql` needs to be pasted into the Supabase Studio SQL editor against production. PR #64 cannot merge until applied.

### Field validation (deferred behind a real rider)
- **First-on-horse verification** — short live session strapped to a horse to confirm H10 + decoder behave outside the lab. *Was scheduled for the 2026-05-23 Saturday window; current state of that window not recorded.*
- **Slice 14 — stress test** — 100-session synthetic insert against staging Supabase, watch fill curve at 25/50/75/95. Cheap to run; not yet executed.
- **H10 chip-recording fallback** — offline recording on the H10's internal storage as a redundancy path if the PWA disconnects. Deferred pending Saturday outcome classification (Green/Yellow/Red).

### V.0 spec items not yet built
- **Slice 15.B — long-press block split** — UX polish on the manual-label review. Power-user feature; 15.A's tap-to-label is sufficient ground truth.
- **Slice 16.5 — anomaly-rest** — flag rest sessions deviating >2σ from per-horse baseline. Algo can be written now; will not fire usefully until ≥5 rest sessions per horse exist.
- **Slice 18 — iPhone universal links + Service Worker passive stream** — magic-link → PWA routing on iOS, and SW that holds the HR queue when the screen locks. Android-only V.0 is shippable without these.

### Process gates
- **Supabase token rotation** — `sbp_fe3e16…` leaked 2026-05-02; rotation deferred until before first real rider per `project_token_rotation_pending`.
- **Freelancer (Luigi) M0 gate** — reproduce `session_metrics` from anonymised inputs before contracting M1. Discovery call was 2026-05-05.

---

## Open branches / PRs

| Branch | PR | State | Notes |
|---|---|---|---|
| `feat/session-kind-picker-voice-notes` | [#64](https://github.com/Rapixx19/Polar-Equine-/pull/64) | open | Blocked on migration 037 apply |
| `slice-13.A-13.E-pmd-ingest` | — | local | Predecessor to merged PR #34 chain; can be deleted |
| `slice-11.8-*`, `slice-11.9-session-notes` | — | local | Stale local branches, superseded by merged work |
| `fix/pmd-*`, `feat/recording-live-vitals`, `fix/end-stale-session-from-home`, `fix/require-real-hr-frame`, `chore/synthetic-demo-seeder` | — | local | Stale local branches whose PRs are merged; safe to delete |

A local-branch cleanup pass is overdue — none of these block, but they clutter `git branch`.

---

## Documentation map

| Audience | Entry point |
|---|---|
| Returning to the project | [`.cursorrules`](.cursorrules) → [`docs/05-build-plan.md`](docs/05-build-plan.md) |
| Frontend / PWA | [`web/README.md`](web/README.md) → [`docs/web/00-overview.md`](docs/web/00-overview.md) |
| Algorithm freelancer | [`algo/README.md`](algo/README.md) → [`docs/shared/07-freelancer-onboarding.md`](docs/shared/07-freelancer-onboarding.md) |
| Data contracts | [`docs/shared/00-data-contracts.md`](docs/shared/00-data-contracts.md), [`docs/02-database-schema.md`](docs/02-database-schema.md) |
| Algorithms (per-metric) | [`docs/algorithms/`](docs/algorithms/) — `02-rr-cleaning`, `03-hrv-metrics`, `04-recovery-tau`, `05-trimp-zones`, `06-gait-detection`, `07-session-metrics`, `08-anomaly-rest` |
| Operations | [`docs/shared/02-deployment.md`](docs/shared/02-deployment.md), [`docs/shared/03-incident-response.md`](docs/shared/03-incident-response.md), [`docs/shared/14-security-gate.md`](docs/shared/14-security-gate.md) |
| Pre-ride checklist | [`docs/web/15-pre-measurement-checklist.md`](docs/web/15-pre-measurement-checklist.md), [`docs/web/16-rider-onsite-card.md`](docs/web/16-rider-onsite-card.md) |
| V.1 backlog | [`docs/V1_BACKLOG.md`](docs/V1_BACKLOG.md) |

---

## Versions

| Component | Version | Pinned in |
|---|---|---|
| Algo service | `0.7.0` | `algo/algorithms/version.py` |
| Web | Next.js 16.2.4 | `web/package.json` |
| Latest applied migration | `038` (horses HR calibration) | `web/supabase/migrations/` |
| Pending migration | `037` (sessions.kind_id) | local only — apply manually to prod |

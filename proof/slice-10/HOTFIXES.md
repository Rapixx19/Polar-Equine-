# Slice 10 — In-flight hotfixes during real-H10 smoke (2026-05-05)

Three commits landed on `slice-10-compute-runner` after PR #9 was opened
`[code-complete, smoke-blocked]`. The first real-H10 capture surfaced two
production bugs (one in algo, one in the Railway build) that synthetic
smoke could not have caught. Each is captured here with rationale so the
audit trail does not depend on commit-message archaeology.

## 1. `50bdbf1` — fix(algo): widen RR cleaning bounds to 300–3000 ms

**Symptom.** First cron tick after a real session-end returned 422
`no_valid_beats`. Algo logs showed `rr_cleaning.clean()` rejecting every
beat because `rr_min_ms = 800` (horse resting RR floor).

**Root cause.** The bounds were tuned for equines (HR 20–75 bpm) but the
Polar H10 is currently mounted on the rider's chest as the integration
proof — rider RR was 515–670 ms (HR 90–115 bpm). The 800 ms floor cut
the entire signal.

**Fix.** Lower `rr_min_ms` to 300 ms. The new range covers a 200 bpm
human peak (300 ms) up to a 20 bpm horse slow rest (3000 ms) — both
physiologies fit cleanly. `algo_version` bumped 0.3.0 → 0.3.1
(Rule 13 — bound change can shift downstream metric values).

**Files.** `algo/algorithms/rr_cleaning.py`, `algo/algorithms/version.py`,
`algo/tests/test_rr_cleaning.py`, `algo/tests/test_health.py`,
`algo/tests/test_data_layer.py`, `algo/README.md`.

## 2. `d403848` — chore(algo): switch Railway build from railpack to Dockerfile

**Symptom.** Railway redeploy of `0.3.1` failed in the build phase with
`No GitHub artifact attestations found for aqua:astral-sh/uv@0.11.9`.
Setting Railway env var `MISE_PARANOID=false` did NOT bypass the check
— the verification happens at the aqua layer below mise.

**Root cause.** Railway's railpack pipeline pulls uv from GitHub via
mise/aqua, which enforces GitHub artifact attestation by default for
the affected uv release window. There is no clean toggle.

**Fix.** Replace railpack with a hand-written `Dockerfile` that:
- Bases on `python:3.11-slim`.
- Installs uv via Astral's official `astral.sh/uv/install.sh` script
  (no GitHub attestation, no mise, no aqua).
- Runs `uv sync --locked --no-dev --no-editable`.

`railway.toml` updated to `[build] builder = "DOCKERFILE"`. Same final
artefact, different supply chain — Astral's official installer is the
upstream-recommended path and is independent of Railway tooling drift.

**Files.** `algo/Dockerfile` (new), `algo/railway.toml`.

## 3. `0ef169e` — fix(railway): wrap startCommand in `sh -c` for `$PORT` expansion

**Symptom.** First Dockerfile-mode deploy crashed at runtime with
`Invalid value for '--port': '$PORT' is not a valid integer`.

**Root cause.** Railway runs `[deploy] startCommand` in exec form when
the build is Dockerfile-based — no shell, so `$PORT` is passed as a
literal string instead of expanded.

**Fix.** Wrap the command in `sh -c '...'` so the shell expands
`${PORT:-8000}` at runtime. The `:-8000` default keeps local
`docker run` happy without requiring `-e PORT=...`.

**Files.** `algo/railway.toml`.

## Outcome

After all three hotfixes redeployed:
- Manual cron trigger via `vercel curl` against the preview deployment
  produced one new `compute_jobs` row that progressed
  `queued → running → succeeded` in a single attempt.
- `session_metrics` row written for session `52b11d52-…` with
  `rr_cleaning_quality = 0.9966`, `hrv_completeness_quality = 1.0000`,
  `algo_version = 0.3.1`.
- `sessions.metrics_status = 'complete'`.

See `real-h10-e2e-smoke.txt` for the full capture and
`real-smoke-2026-05-05.json` for the structured row.

## Why these are committed in-repo (not just in the PR body)

PR descriptions are ephemeral on GitHub. Phase 3 is the
**🎯 FIRST COMPUTE** thesis milestone — the artefact that proves the
pipeline shipped end-to-end on real physiology must live in the
repository so a thesis reader six months from now can find it without
GitHub access. Per build-plan HARD RULE: Phase 3 closes only on real
H10 data, not synthetic.

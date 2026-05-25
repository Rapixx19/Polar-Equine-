# Polar-Equine- (codename: La Fattoria / Sentavita)

Research data-collection platform for sport horses. Captures HR + R-R + accelerometer + raw ECG from a stock **Polar H10 Equine** sensor via Web Bluetooth, cleans the signals, and classifies gait — all behind a phone-first PWA.

V.0 mission: **Collect → Clean → Classify**. Not Whoop. No readiness, no strain, no illness alerts. Those are V.1.

---

## Repo layout

| Path | What's there | Owner | Deploys to |
|---|---|---|---|
| `web/` | Next.js 14 + TS PWA + admin dashboard | Ferdinand | Vercel (root = `web/`) |
| `algo/` | Python 3.11 + FastAPI algorithm service | Ferdinand → freelancer (post V.0) | Railway (root = `algo/`) |
| `docs/` | Spec — source of truth | Ferdinand | — |
| `scripts/` | Cross-cutting SQL + tooling | Ferdinand | — |
| `.github/workflows/` | Path-filtered CI (web + algo run independently) | — | GitHub Actions |
| `.cursorrules` | Read every session before responding | — | — |

The two sub-trees share **only** the Postgres schema (`web/supabase/migrations/`) and the bearer token used for `web → algo` HTTPS calls. There is **no shared code** between TypeScript and Python.

---

## Where to start

| You are… | Read first |
|---|---|
| Ferdinand (returning to the project) | `.cursorrules` → `docs/05-build-plan.md` (current slice) |
| Algorithm freelancer | `algo/README.md` → `docs/shared/07-freelancer-onboarding.md` |
| Frontend freelancer | `web/README.md` → `docs/web/00-overview.md` |
| Just curious | `docs/00-product-overview.md` |

---

## Local dev quickstart

```bash
# Algo service
cd algo
uv sync
cp .env.example .env       # paste ALGO_BEARER_TOKEN
uv run uvicorn service.main:app --port 8787 --reload

# Web (in another terminal)
cd web
npm install
cp .env.local.example .env.local   # paste ALGO_BASE_URL + ALGO_BEARER_TOKEN
npm run dev
supabase start              # local Postgres
```

Verify the bearer round-trip:
```bash
curl -i http://localhost:3000/api/_smoke   # → 200 with algo health
```

---

## Build status

Tracking against [`docs/05-build-plan.md`](docs/05-build-plan.md) — 20 slices in 6 phases, ~108 hrs.

**Current state (2026-05-25):** Phases 0–3 done, Phase 4 partial (PMD + gait v0.1 ✅, stress test pending), Phase 5 partial (manual labels + admin dashboard ✅, anomaly-rest pending), Phase 6 partial (security gate ✅, iPhone polish + first-on-horse pending). Algo `0.7.0` live on Railway, latest migration `038`.

See [`STATUS.md`](STATUS.md) for the full snapshot — what's shipped, what's pending, open branches, doc map.

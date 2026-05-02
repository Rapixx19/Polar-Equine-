# La Fattoria — V.0 Build Specification

> **Equine welfare and performance research platform.** Captures sensor data from sport horses across structured activity contexts; produces clean, exportable datasets for veterinary research.

This `/docs` folder is the complete, authoritative specification for the V.0 software stack. Every file is intended to be fed to Claude Code or read by a human dev as the source of truth.

## What La Fattoria is

A research-grade session-logging platform for sport horses. Riders connect a Polar H10 sensor to their phone via Web Bluetooth, log sessions (walk/trot/canter/jump and rest contexts), and the system runs cardiac + motion analytics. Algorithms produce auto-detected gait labels, cardiac metrics (HRV, recovery τ, TRIMP), and per-horse trends. Riders approve labels in the PWA. Admins review across the stable in a dashboard.

## Architecture at a glance

```
   ┌─────────────────────┐     BLE     ┌──────────────────────┐
   │   Polar H10 / Equine │ ──────────▶ │  Rider's phone       │
   │   on horse's girth   │             │  La Fattoria PWA     │
   └─────────────────────┘             │  (Web Bluetooth)     │
                                        └─────┬────────────────┘
                                              │ HTTPS (samples)
                                              ▼
   ┌──────────────────────────────────────────────────────────┐
   │  WEB REPO — Next.js + TypeScript on Vercel               │
   │  - PWA (rider-facing)                                     │
   │  - Admin dashboard                                        │
   │  - API routes (ingest, sessions, auth)                    │
   └─────┬────────────────────────────────────────┬───────────┘
         │ Supabase                               │ HTTPS (compute)
         ▼                                        ▼
   ┌──────────────────────┐         ┌──────────────────────────┐
   │  Supabase            │         │  ALGORITHMS REPO         │
   │  Postgres + Storage  │◀────────│  Python / FastAPI        │
   │  + Auth (magic link) │         │  Deployed on Railway     │
   │  + Realtime          │         │  - Cardiac processing    │
   └──────────────────────┘         │  - Gait detection        │
                                    │  - Session metrics       │
                                    └──────────────────────────┘
```

## Two repositories

| Repo | Stack | Deploy | Purpose |
|---|---|---|---|
| `lafattoria-web` | Next.js 14 + TypeScript + Tailwind + Supabase client | Vercel | PWA, admin dashboard, API routes, BLE integration |
| `lafattoria-algo` | Python 3.11 + FastAPI + neurokit2 + scipy + scikit-learn | Railway (or Fly.io) | Algorithm pipeline — runs on session-end events |

The two repos communicate over HTTPS using a shared bearer token. They share nothing except the database (Supabase). Each can be deployed independently.

## Folder structure of this spec

```
/docs/
├── README.md                          ← this file
├── 00-product-overview.md             ← what we're building, who for, what's in/out of V.0
├── 01-architecture.md                 ← detailed system design, data flow contracts
├── 02-database-schema.md              ← Supabase tables, indexes, migrations
├── 03-auth-and-permissions.md         ← magic-link auth, rider/admin roles
├── 04-design-system.md                ← colors, typography, components
├── 05-build-plan.md                   ← weekend-by-weekend build sequence
│
├── web/                               ← lafattoria-web repo specs
│   ├── 00-overview.md                 ← repo structure, conventions
│   ├── 01-pwa-onboarding.md           ← magic-link login, rider profile
│   ├── 02-pwa-session-flow.md         ← start/record/end session screens
│   ├── 03-pwa-band-pairing.md         ← Web Bluetooth integration
│   ├── 04-pwa-label-review.md         ← post-session label approval
│   ├── 05-admin-today.md              ← admin "Today" screen
│   ├── 06-admin-horses.md             ← horses list and detail
│   ├── 07-admin-sessions.md           ← sessions list and session detail
│   ├── 08-admin-bands.md              ← bands management
│   ├── 09-api-ingest.md               ← /api/ingest/* endpoints
│   ├── 10-api-sessions.md             ← /api/sessions/* endpoints
│   ├── 11-api-auth.md                 ← /api/auth/* endpoints
│   ├── 12-realtime-channels.md        ← Supabase Realtime subscriptions
│   ├── 13-testing-strategy.md         ← unit + integration tests for web
│   └── 14-pwa-vitals-home.md          ← vitals-first home screen (replaces old session-flow start)
│
├── algorithms/                        ← lafattoria-algo repo specs
│   ├── 00-overview.md                 ← repo structure, conventions, plug-in/out design
│   ├── 01-service-api.md              ← FastAPI endpoints, contracts with web
│   ├── 02-rr-cleaning.md              ← R-R interval cleaning (algorithm + tests)
│   ├── 03-hrv-metrics.md              ← RMSSD, SDNN, pNN50
│   ├── 04-recovery-tau.md             ← post-exercise HR decay fit
│   ├── 05-trimp-zones.md              ← TRIMP and HR zone time
│   ├── 06-gait-detection.md           ← auto-detect walk/trot/canter/jump from ACC
│   ├── 07-session-metrics.md          ← composing all per-session metrics
│   ├── 08-anomaly-rest.md             ← in-rest anomaly flagging
│   └── 09-testing-strategy.md         ← unit + integration tests for algorithms
│
├── shared/                            ← cross-repo concerns
│   ├── 00-data-contracts.md           ← JSON shapes shared between web ↔ algo
│   ├── 01-environment-variables.md    ← all env vars across both repos
│   ├── 02-deployment.md               ← Vercel + Railway + Supabase setup
│   ├── 03-incident-response.md        ← what to do when things break
│   ├── 04-v0-mission.md               ← scope guardrails — read every session
│   ├── 05-data-quality.md             ← per-session quality scoring + monitoring
│   ├── 06-data-export.md              ← Parquet exports for thesis + Sharad
│   ├── 07-freelancer-onboarding.md    ← Day-1 onboarding for new contributors
│   ├── 08-backend-pipeline.md         ← end-to-end data flow diagram
│   ├── 09-v0-1-hardening.md           ← critical fixes from CEO spec review (5 items)
│   ├── 10-training-dataset.md         ← ML-ready Parquet format for V.1 algorithm training
│   ├── 11-correction-tracking.md      ← rider corrections as ground truth pipeline
│   └── 12-v1-evolution-path.md        ← bridge between V.0 (data collection) and V.1 (ML)
│
└── .cursorrules                       ← Cursor reads this on every prompt
```

## Activity types (locked)

Seven activity types in V.0. Defined in `lib/activities.ts`, validated by API + database CHECK constraint:

| Code | Display | Sub-types | Auto-detect? |
|---|---|---|---|
| `riding` | Riding session | walk / trot / canter / jump | Yes (gait detection on ACC) |
| `grass_field` | Grass field | none | No |
| `walker` | Horse walker | none | No |
| `stall` | Stall rest | none | No |
| `transport` | Transport | none | No |
| `vet` | Vet / treatment | none + free-text note | No |
| `other` | Other | free-text description | No |

## Core principles (apply everywhere)

These rules are non-negotiable. Every file you write should respect them.

### 1. Modular plug-in / plug-out

Every feature is a single, isolated module. Adding a new feature should never require editing existing code — only adding new code. **Open–closed principle, strictly applied.**

A feature module exposes a clear interface (functions, types, endpoints). Internal implementation is private. Replacing the implementation should not affect callers.

Example: `gait-detection` is a Python module with one entry point `detect_gaits(acc_samples) → List[GaitSegment]`. The web app calls it via HTTP. If we replace the rule-based implementation with a trained model, **no other code changes**.

### 2. 150-line file limit

Every TypeScript file ≤ 150 lines. Every Python file ≤ 150 lines. Including imports and blank lines. If a file approaches the limit, split before continuing. Comments and docstrings are encouraged but count toward the limit — write tight.

This rule sounds artificial but it forces clean separation. A 150-line file does one thing well.

### 3. Integration tests for every feature

Every feature module has at least one integration test that exercises its public interface end-to-end. Unit tests are good but optional; integration tests are required.

- Web: Vitest + Playwright for end-to-end, MSW for API mocks
- Algorithms: pytest with real sample data fixtures, FastAPI TestClient

### 4. Algorithms are commented for non-author readers

Every algorithm function has a docstring with: what it does, why it's done this way, references to literature, parameter explanations. **Sharad will leave one day; the algorithms must survive him.**

### 5. Riders log in once, system remembers them

Magic-link auth via Supabase. Enter email → tap link in inbox → logged in. Cookie persists 90 days. From the rider's perspective: "I clicked once a long time ago, now the app just opens."

Each rider sees only their own sessions and horses they're authorized to ride. Admins see everything.

### 6. Sessions belong to riders permanently

Once a rider creates a session, it's theirs. Even if their account is later closed, the data persists (with rider name preserved). Sessions can be reassigned by admins if needed.

### 7. No surprises in the database

Every table has clear ownership (which feature owns it), every column has a comment explaining its purpose, every migration is reversible. Schema changes go through a migration file, never edited in production.

## Stack (locked, do not change)

### `lafattoria-web`
- **Framework:** Next.js 14 App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + shadcn/ui
- **Auth:** Supabase Auth (magic links only, no passwords)
- **Database client:** Supabase JS client v2
- **Realtime:** Supabase Realtime channels
- **Charts:** Recharts
- **Testing:** Vitest (unit), Playwright (e2e), MSW (API mocks)
- **Deploy:** Vercel
- **Domain:** `lafattoria.app`

### `lafattoria-algo`
- **Framework:** FastAPI
- **Language:** Python 3.11+
- **Cardiac:** neurokit2, hrv-analysis, biosppy
- **Signal processing:** numpy, scipy, pandas
- **ML:** scikit-learn (rule-based + lightweight classifiers)
- **HTTP client:** httpx
- **Testing:** pytest, pytest-asyncio, hypothesis
- **Deploy:** Railway (or Fly.io as backup)
- **Auth to web:** shared bearer token
- **Endpoint:** `algo.lafattoria.app` or Railway-supplied URL

### Shared
- **Database:** Supabase Postgres (eu-central-1, Frankfurt)
- **Storage:** Supabase Storage for raw ECG bundles
- **Secrets management:** Vercel + Railway env vars (synced manually for V.0)

## What's in V.0 (locked)

✅ Polar H10 only — HR, R-R intervals, accelerometer, raw ECG
✅ Magic-link rider login + admin password
✅ Session logging (walk/trot/canter/jump and 3 rest contexts)
✅ Auto-gait-detection with rider approval flow
✅ Per-session cardiac metrics (HR, RMSSD, recovery τ, TRIMP, time-in-zones)
✅ Per-horse trends across sessions
✅ Real-time HR streaming during recording
✅ Multi-rider concurrent use
✅ Session notes and rider attribution

## What's NOT in V.0 (deferred to V.1)

❌ Skin temperature
❌ Respiratory rate from barometer
❌ 24/7 continuous wear
❌ Sleep / recumbency analytics
❌ Whoop-style readiness 0–100
❌ Sub-clinical illness detection (needs continuous baseline)
❌ Cross-stable population norms (needs more horses)
❌ ECG arrhythmia classification (V.0 stores raw ECG; V.1 adds the classifier)

These are V.1 deliverables. **Do not build them now.**

## Read order for new developers

If you're new to the project:

1. Read this file
2. Read `00-product-overview.md` — understand what and why
3. Read `01-architecture.md` — understand the shape
4. Read `web/00-overview.md` and `algorithms/00-overview.md`
5. Pick a feature you'll work on, read its spec end-to-end
6. Read the integration test file for that feature
7. Build

## Read order for Claude Code

When pasting into Claude Code at the start of a build session:
1. Always include this README
2. Include `01-architecture.md`, `02-database-schema.md`, `04-design-system.md`
3. Include the specific feature spec(s) for the task
4. Include any spec the feature depends on (check the "depends on" section of each feature)

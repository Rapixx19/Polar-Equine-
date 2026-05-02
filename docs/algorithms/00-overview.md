# algorithms/00 · `lafattoria-algo` Repo Overview

## What this repo is

A separate Python repository deploying a FastAPI service that runs all signal processing and algorithms. Triggered by web on session-end events, reads raw samples from Supabase, computes metrics and gait labels, writes results back.

## Folder structure

```
lafattoria-algo/
├── app/
│   ├── main.py                       ← FastAPI app entry (≤ 100 lines)
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── compute.py                ← POST /compute
│   │   ├── recompute.py              ← POST /recompute
│   │   └── health.py                 ← GET /health
│   ├── auth.py                       ← bearer token check (≤ 50 lines)
│   └── config.py                     ← env vars (≤ 80 lines)
│
├── algorithms/                       ← the science
│   ├── __init__.py
│   ├── rr_cleaning.py                ← see 02-rr-cleaning.md
│   ├── hrv_metrics.py                ← see 03-hrv-metrics.md
│   ├── recovery_tau.py               ← see 04-recovery-tau.md
│   ├── trimp_zones.py                ← see 05-trimp-zones.md
│   ├── gait_detection.py             ← see 06-gait-detection.md
│   ├── session_metrics.py            ← see 07-session-metrics.md
│   └── anomaly_rest.py               ← see 08-anomaly-rest.md
│
├── data/
│   ├── __init__.py
│   ├── supabase_client.py            ← supabase-py wrapper (≤ 100 lines)
│   ├── readers.py                    ← read samples_* (≤ 100 lines)
│   └── writers.py                    ← write metrics + labels (≤ 100 lines)
│
├── tests/
│   ├── unit/
│   │   ├── test_rr_cleaning.py
│   │   ├── test_hrv_metrics.py
│   │   ├── test_recovery_tau.py
│   │   ├── test_trimp_zones.py
│   │   ├── test_gait_detection.py
│   │   ├── test_session_metrics.py
│   │   └── test_anomaly_rest.py
│   ├── integration/
│   │   ├── test_compute_endpoint.py
│   │   └── test_full_session.py
│   └── fixtures/
│       ├── healthy_session_50min.parquet
│       ├── synthetic_gallop.parquet
│       └── horse_with_av_block.parquet
│
├── pyproject.toml                    ← Poetry deps
├── Dockerfile                        ← Railway deploy
├── railway.toml                      ← Railway config
├── .env.example
├── .python-version
└── README.md
```

## Stack (locked)

| Purpose | Library | Why |
|---|---|---|
| Web framework | FastAPI | Async, modern, auto-OpenAPI docs |
| HRV / cardiac | neurokit2 | De-facto standard, well-tested, Tarvainen Kubios methods |
| HRV cross-check | hrv-analysis, pyhrv | Triangulate when results look weird |
| Signal processing | numpy, scipy | foundation |
| Data | pandas, pyarrow | DataFrames + Parquet for large arrays |
| Database | supabase-py | Match web side |
| ML (V.0 baseline) | scikit-learn | Random Forest classifier in one line |
| Testing | pytest, pytest-asyncio, hypothesis | Standard Python |
| HTTP | httpx | Async, modern |

## Modular plug-in / plug-out principles

Every algorithm module:
- Exposes a single public function with a typed signature
- Has a docstring describing what it does, why, references
- Has a unit test file with the same name (`test_X.py`)
- Is callable in isolation (no global state)
- Has a default config baked in but accepts overrides
- ≤ 150 lines including imports, docstrings, comments

The orchestration in `compute.py` calls the modules in order. Replacing one module never touches another.

Example: `gait_detection.py` exposes:

```python
def detect_gaits(
    acc_samples: pd.DataFrame,    # columns: t_ms, ax, ay, az
    config: GaitConfig = DEFAULT_CONFIG
) -> list[GaitSegment]:
    """
    Auto-detect gait segments from accelerometer data.
    
    Returns segments: [{start_ms, end_ms, label_type, confidence}, ...]
    
    Algorithm:
    1. Compute signal magnitude
    2. Window 4s, 50% overlap
    3. FFT per window, identify dominant frequency
    4. Classify by frequency band: walk 0.8-1.2Hz, trot 1.3-1.7Hz, etc.
    5. Smooth with median filter
    6. Merge same-label adjacent windows
    7. Run separate jump-detection pass
    
    References:
    - Pfau et al. 2007 J Exp Biol — equine stride frequency by gait
    - Robilliard et al. 2007 — gait classification baseline
    """
    ...
```

If we swap the rule-based implementation for a trained 1D CNN, this signature is unchanged. `compute.py` doesn't know or care.

## The contract: how `/compute` is triggered

Web (`/api/sessions/[id]` PATCH end) → algo (`/compute`):

```http
POST /compute
Authorization: Bearer ${ALGO_BEARER_TOKEN}
Content-Type: application/json

{ "session_id": "uuid" }
```

Algo:
1. Reads samples from Supabase
2. Runs Layer 1 (cleaning, signal processing)
3. Runs Layer 2 (gait detection, anomaly checks)
4. Runs Layer 3 (composes session_metrics)
5. Writes labels rows
6. Writes session_metrics row
7. Updates `sessions.metrics_status = 'complete'`
8. Returns 200

Total target time: < 8 seconds for a 50-min session.

## Conventions

- Type hints everywhere, mypy strict
- All algorithm functions accept and return clean dataclasses or DataFrames
- No module mutates inputs — return new objects
- Logging via `structlog`, JSON output for Railway log aggregation
- Errors raise typed exceptions (`AlgoError`, `MissingDataError`, etc.)

## Environment variables

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
WEB_BASE_URL=https://lafattoria.app
ALGO_BEARER_TOKEN=                  # incoming auth from web
ALGO_VERSION=0.1.0                  # written into session_metrics
LOG_LEVEL=INFO
```

## Linked feature specs

| File | Module |
|---|---|
| 01-service-api.md | FastAPI endpoints |
| 02-rr-cleaning.md | R-R interval cleaning |
| 03-hrv-metrics.md | RMSSD, SDNN, pNN50 |
| 04-recovery-tau.md | Post-exercise HR decay fit |
| 05-trimp-zones.md | TRIMP and HR zones |
| 06-gait-detection.md | Auto-detect walk/trot/canter/jump |
| 07-session-metrics.md | Compose all per-session metrics |
| 08-anomaly-rest.md | In-rest anomaly flagging |
| 09-testing-strategy.md | Test conventions |

# algo/ — La Fattoria algorithm service

> **You are a freelancer joining post-V.0?** This is your home. You will never need to read or modify anything in `web/`. Read this file, then `docs/shared/07-freelancer-onboarding.md`.

Python 3.11 + FastAPI service. Receives session data from `web/` over HTTPS, computes HRV / TRIMP / recovery / gait metrics, writes results to Supabase. Deploys to Railway.

---

## Run locally

```bash
# 1. Install uv (one-time): https://docs.astral.sh/uv/getting-started/installation/
brew install uv

# 2. Sync deps + auto-install Python 3.11
uv sync

# 3. Set the bearer token (matches the one web/ uses)
cp .env.example .env
# edit .env: paste ALGO_BEARER_TOKEN=<value from 1Password>

# 4. Run the service
uv run uvicorn service.main:app --port 8787 --reload
```

Smoke test:
```bash
curl -i http://localhost:8787/health -H "Authorization: Bearer $ALGO_BEARER_TOKEN"
# → 200 {"status":"ok","algo_version":"0.2.0"}

curl -i http://localhost:8787/health
# → 401 {"detail":"invalid bearer"}

# /compute (Slice 9): synthetic-only mode — body is a raw RR list.
# Slice 10 swaps this to {"session_id": "<uuid>"} once the algo can read samples_hr.
curl -s http://localhost:8787/compute \
  -H "Authorization: Bearer $ALGO_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rr_ms":[1900,2050,1980,2100,...]}' | jq
# → 200 {rmssd_ms, sdnn_ms, pnn50_pct, pnn20_pct, mean_rr_ms, n_beats,
#         rr_cleaning_quality, hrv_completeness_quality, algo_version}
```

---

## Layout

```
algo/
├── service/          # FastAPI app — never edit unless adding an endpoint
│   ├── main.py       # routes mount here (/health, /compute)
│   ├── auth.py       # bearer-token check (Rule 14)
│   ├── models.py     # Pydantic request/response (extra='forbid')
│   └── settings.py   # pydantic-settings; loads .env
├── algorithms/       # ← FREELANCER WORK LIVES HERE
│   ├── version.py    # bump algo_version on EVERY change (Rule 13)
│   ├── rr_cleaning.py        # Slice 9 — clean()
│   ├── hrv_metrics.py        # Slice 9 — compute()
│   ├── recovery_tau.py       # Slice 11.5
│   ├── trimp_zones.py        # Slice 11
│   ├── gait_detection/       # Slice 13
│   └── anomaly_rest.py       # Slice 16.5
└── tests/
    ├── test_health.py
    ├── test_rr_cleaning.py
    ├── test_hrv_metrics.py
    ├── test_compute_endpoint.py
    └── fixtures/
        └── physionet_nsrdb_16265.json   # Slice 9 — 5-min ref window, fs=128
```

---

## Adding a new algorithm

Each algorithm = **one file**, **one public function**, single responsibility. See `.cursorrules` Rule 3.

```python
# algorithms/your_algorithm.py
from dataclasses import dataclass
import pandas as pd

@dataclass
class YourConfig:
    threshold: float = 0.5

@dataclass
class YourResult:
    value: float
    quality: float        # 0..1, 1 = pristine
    algo_version: str     # always populated; bump version.py when YOU change anything

def compute(              # ← THE single public function. Other modules import only this.
    inputs: pd.DataFrame,
    config: YourConfig = YourConfig(),
) -> YourResult:
    """
    What this does (one paragraph).
    Why this approach (one paragraph).
    Equine-specific tuning notes — humans-vs-horses pitfalls.
    Citation: Author Year, Journal Volume:Page
    """
    ...

def _helper(...):         # private — prefixed with _
    ...
```

Then:
1. Bump `algorithms/version.py` (e.g. `"0.1.0"` → `"0.1.1"`)
2. Add a test in `tests/test_your_algorithm.py` using a fixture in `tests/fixtures/`
3. `uv run pytest`
4. `uv run mypy --strict service algorithms`
5. `uv run ruff check .`

---

## Tests

```bash
uv run pytest                              # all tests
uv run pytest tests/test_health.py -v      # one file
uv run mypy --strict service algorithms    # type check
uv run ruff check .                        # lint
```

Fixtures land in `tests/fixtures/` from Slice 9 onward — Parquet for synthetic R-R streams, PhysioNet samples for HRV cross-validation. **You do not need a Polar H10 to validate your work.**

---

## Deploy

`railway.toml` configures the build. Railway sees `algo/` as the project root (set in Railway dashboard). Env var: `ALGO_BEARER_TOKEN` (must match the value Vercel knows).

---

## Hard rules (read `.cursorrules` for full list)

- **Rule 1**: Files ≤ 150 lines
- **Rule 3**: Algorithms expose ONE public function
- **Rule 7**: `mypy --strict` passes; type hints on every public function
- **Rule 8**: Raw data is sacred — never overwrite samples
- **Rule 9**: No silent failures — failed compute marks `metrics_status='failed'`, never returns zeros
- **Rule 11**: One-way dep: `web → algo`, never reverse
- **Rule 13**: Bump `algo_version` on every algorithm change

<!-- ci-trigger: algo-only path filter check (slice 1 verification) -->

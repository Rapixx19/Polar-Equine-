# shared/07 · Freelancer Onboarding

## Why this exists

Sharad is the first freelancer working on the algorithm repo. He won't be the last. The codebase must be readable cold, by anyone, in under a day. This doc is the on-ramp.

## Day 1 — Algorithm freelancer onboarding

If you've just been added to `lafattoria-algo`, do these in order:

### Hour 1 — Read the lay of the land

1. Read `/docs/README.md` (10 min)
2. Read `/docs/00-product-overview.md` (10 min)
3. Read `/docs/04-v0-mission.md` (10 min) — internalize the scope boundary
4. Read `/docs/algorithms/00-overview.md` (15 min)
5. Skim the file tree of the repo (5 min)
6. Read `.cursorrules` at the repo root (10 min)

### Hour 2 — Run the code locally

```bash
# Clone
git clone git@github.com:.../lafattoria-algo.git
cd lafattoria-algo

# Install Python 3.11 if needed (asdf, pyenv, brew)
poetry install

# Get .env from Ferdinand (DO NOT commit)
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALGO_BEARER_TOKEN

# Run tests
poetry run pytest

# Run the service
poetry run uvicorn app.main:app --reload --port 8000

# Smoke test
curl http://localhost:8000/health
# → {"status":"ok"}
```

If tests fail, escalate to Ferdinand before doing anything else. The tree should be green.

### Hour 3 — Read one algorithm end-to-end

Pick `algorithms/hrv_metrics.py` (it's the simplest):

1. Read the spec: `/docs/algorithms/03-hrv-metrics.md`
2. Read the code: `algorithms/hrv_metrics.py`
3. Read the test: `tests/unit/test_hrv_metrics.py`
4. Run only that test: `poetry run pytest tests/unit/test_hrv_metrics.py -v`
5. Add a `print()` somewhere, run the test, confirm you see the print

You should now understand how a feature module is structured.

### Hour 4 — Make a trivial change and ship it

Pick something safe:

- Improve a docstring
- Add a missing type hint
- Add a unit test for an edge case

Process:
1. Create a branch: `git checkout -b onboard/your-name`
2. Make the change
3. Run tests + mypy: `poetry run pytest && poetry run mypy app algorithms`
4. Commit with a clear message
5. Push, open a PR
6. Ferdinand reviews, you ship it

Once that PR is merged, you've completed onboarding.

## Day 1 — Web freelancer onboarding

Same arc, different repo. `lafattoria-web` instead of `algo`. Read:

1. `/docs/README.md`
2. `/docs/00-product-overview.md`
3. `/docs/04-v0-mission.md`
4. `/docs/web/00-overview.md`
5. `.cursorrules` at the web repo root

Then:

```bash
git clone git@github.com:.../lafattoria-web.git
cd lafattoria-web
npm install
cp .env.example .env.local
# Fill in Supabase + algo URLs

npm run dev
# → http://localhost:3000

npm run test
npm run typecheck
npm run lint
```

Pick `app/(rider)/home/page.tsx` to read end-to-end. Make a trivial improvement (copy fix, accessibility label). Open a PR.

## What freelancers should NOT do without asking

- Add a new dependency (npm or pip)
- Change a database migration
- Modify the public signature of an algorithm function
- Add a new public API endpoint
- Change RLS policies
- Touch the deploy config (Vercel, Railway, Supabase)
- Restructure folders or rename modules
- Change the spec files in `/docs/`

If a task seems to require any of the above, write up the proposal in a GitHub issue and tag Ferdinand. Don't just do it.

## What freelancers CAN do without asking

- Fix bugs (with a reproducing test)
- Improve documentation and comments
- Add tests
- Refactor inside a single module (file stays ≤150 lines)
- Performance improvements (with a benchmark)
- Implement a new algorithm module per its existing spec

## How to ask good questions

Bad: "How does the algo work?"

Good: "I'm looking at `algorithms/recovery_tau.py`. The `bounds=([20, 5, 5], [120, 200, 600])` in the curve_fit call — where do those numbers come from? I see the docstring cites Marlin & Nankervis 2002 but I want to confirm the lower bound on τ being 5s rather than something larger."

Specific, references the spec, shows you've already looked. This makes Ferdinand's response 10x more useful.

## Branch and PR conventions

- Branch name: `feature/short-description` or `fix/short-description` or `docs/short-description`
- PR title: imperative mood, "Add X" not "Added X"
- PR description includes:
  - What changed
  - Why
  - How it was tested
  - Any risk or follow-up needed

## Code review expectations

- Ferdinand reviews every PR before merge
- Expected turnaround: 24 hours weekday, 48 hours weekend
- Comments asking for changes get addressed in the same PR (push more commits, don't open new PR)
- Once approved, you can squash-merge to main

## Cadence

- Async by default — Slack / WhatsApp for everything
- Weekly 30-min sync (optional, if there's enough to discuss)
- Show-and-tell at end of every algorithm module

## Where to find help

| Topic | Resource |
|---|---|
| Equine cardiac physiology | `algorithms/02-rr-cleaning.md` references; Marlin & Nankervis 2002 textbook |
| Polar H10 BLE protocol | github.com/polarofficial/polar-ble-sdk (Kotlin/Swift sources) |
| HRV methodology | Tarvainen 2014, Lipponen 2019; neurokit2 source |
| FastAPI patterns | fastapi.tiangolo.com |
| Supabase | supabase.com/docs |
| The original spec | `/docs/` is always the source of truth |

## Anti-patterns to avoid

- Adding a feature because "it would be cool" — read `04-v0-mission.md` first
- Optimizing prematurely — clean and correct beats fast and broken
- Generating a 200-line file and then trying to split it — split as you go
- Silent failures — surface errors, mark quality scores
- Reaching across module boundaries — use the public function or add a utility

## Welcome

Sentavita is a real product solving a real problem. Welfare in equestrian sport has structural problems that this kind of data can help fix. Take it seriously, ship clean code, push back when something doesn't make sense. Looking forward to working together.

— Ferdinand

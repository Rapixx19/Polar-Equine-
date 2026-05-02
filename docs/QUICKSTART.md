# QUICKSTART — ship by tomorrow evening

> When the Polar H10 Equine arrives, this is the path. Aim: hold the band against your own chest, open `lafattoria.app` on your phone, log a 5-minute "test session," confirm data lands in Supabase. That's the smoke test.

## Tonight (before band arrives) — provisioning

These all run in parallel, mostly accounts and DNS. Plan ~2 hours.

1. **Buy domain** — `lafattoria.app` from Cloudflare or Namecheap (€15/yr)
2. **Create accounts** — Vercel, Supabase, Railway, GitHub (all free to start)
3. **Create two repos** on GitHub: `lafattoria-web` and `lafattoria-algo`
4. **Provision Supabase project** in `eu-central-1` (Frankfurt). Save the URL + anon key + service-role key.
5. **Connect Vercel to `lafattoria-web`** for auto-deploy (push a `create-next-app` placeholder first to confirm the deploy works)
6. **Connect Railway to `lafattoria-algo`** for auto-deploy (push a FastAPI Hello-World first)
7. **Generate the bearer token** for algo↔web auth: `openssl rand -base64 48`
8. **Configure DNS** — apex `lafattoria.app` → Vercel, subdomain `algo.lafattoria.app` → Railway

## Tomorrow morning — minimum viable PWA

Open Cursor with `/docs/` loaded. Goal: working PWA that connects to a Polar H10, logs a session, ingests samples to Supabase. **Skip everything that isn't on this critical path.**

### Step 1 — Database schema (15 min)

Apply the migrations in `02-database-schema.md` via Supabase CLI:
```bash
supabase link --project-ref YOUR_REF
supabase db push
```

This includes the V.0.1 hardening migrations (008-010 for compute jobs, idempotency, stale-session cleanup) — see `shared/09-v0-1-hardening.md` for the rationale on each.

### Step 2 — Auth flow (45 min)

Build per `web/01-pwa-onboarding.md` and `web/11-api-auth.md`:
- Welcome screen with email input
- POST /api/auth/magic-link
- Auth callback handler
- Provision rider profile

Test: enter your email, get the magic link, log in.

### Step 3 — Vitals-first home (30 min)

Build per `web/14-pwa-vitals-home.md`:
- Skip auto-detect for now (manual activity picker)
- Vitals card with three states (no band / connected passive / recording)
- Activity picker with 7 types
- Recent sessions list (can be empty for now)

### Step 4 — BLE pairing (90 min)

Build per `web/03-pwa-band-pairing.md`:
- "Connect Polar H10" button triggers `navigator.bluetooth.requestDevice()`
- Subscribe to HR characteristic (UUID 0x2A37)
- Decode HR + R-R from notifications
- Display live HR in vitals card

**Test now:** strap the H10 to your own chest, open the PWA, tap connect, see your HR.

### Step 5 — Session start + ingest (60 min)

Build per `web/09-api-ingest.md` and `web/10-api-sessions.md`:
- POST /api/sessions creates a new session
- Batcher accumulates samples, posts to /api/ingest/samples every 2s
- Validation, RLS-checked insert

### Step 6 — Recording screen + session end (45 min)

- Recording screen shows live HR, elapsed time, "End" button
- "End" calls PATCH /api/sessions/[id] with action=end
- Server marks session completed (skip algo trigger for now — that's tomorrow afternoon)

### Step 7 — Smoke test (30 min)

- Strap H10 to your chest
- Open PWA on phone, log in, connect band
- See live vitals
- Pick "Other / Test", pick a horse you've manually inserted, tap Start
- Wait 5 minutes, end session
- Open Supabase dashboard, check that:
  - One row in `sessions`
  - ~300 rows in `samples_hr`
  - End time set correctly

If this works, ship it. If it doesn't, fix it.

**If you have an iPhone:** also test the Bluefy flow specifically. Per `web/01-pwa-onboarding.md`, iPhone has known V.0 onboarding friction (Safari opens the magic link, not Bluefy). Note any additional issues:

- Does HR streaming actually work in Bluefy? (a 2023 GitHub issue reported notifications failing — verify resolved)
- Does the cookie persist across Safari → Bluefy paste flow?
- Does passive streaming survive screen lock?

Document findings. These results drive the V.0.1 iPhone fix decision (per `V1_BACKLOG.md`).

## Tomorrow afternoon — algo service

Once the smoke test passes, wire up the algorithm pipeline:

### Step 8 — Algo skeleton (60 min)

Build per `algorithms/00-overview.md` and `algorithms/01-service-api.md`:
- FastAPI app with /health and /compute
- Bearer token verification
- Deploy to Railway, smoke-test with curl

### Step 9 — RR cleaning + HRV (45 min)

Per `algorithms/02-rr-cleaning.md` and `algorithms/03-hrv-metrics.md`:
- Implement clean() using neurokit2
- Implement compute() for HRV metrics
- Unit tests pass

### Step 10 — Wire web → algo (30 min)

- /api/sessions/[id] PATCH with action=end now POSTs to algo /compute
- Algo writes session_metrics row
- Web reads it back

### Step 11 — End-to-end smoke test (30 min)

- Repeat session smoke test
- This time, after End, see metrics appear in Supabase
- Verify HR avg, HR peak, RMSSD all populated
- Quality score sensible

If this works, you have the V.0 minimum viable platform. **Ship it, declare victory.**

## Day 3 onwards — fill in the rest

Things you skipped on day 1 that you need before stable deployment:

- ACC + ECG ingest (PMD characteristics, binary frame decoding)
- Gait detection algorithm (`algorithms/06-gait-detection.md`)
- Label review screen (`web/04-pwa-label-review.md`)
- Admin dashboard (`web/05-admin-today.md` etc.)
- Data quality scoring (`shared/05-data-quality.md`)
- Realtime live HR push to recording screen (`web/12-realtime-channels.md`)

Build these in priority order. Each is its own focused PR. Don't try to do everything in one weekend.

## What "good enough to ship to a real stable" means

Before driving to deployment:

- ✅ Full session lifecycle works (auth → start → record → end → review → save)
- ✅ Polar H10 streams HR + ACC + ECG reliably
- ✅ Algorithm pipeline runs end-to-end without errors
- ✅ Admin dashboard shows sessions and traces
- ✅ At least one full real session has been logged on yourself
- ✅ Data export to Parquet works
- ✅ Quality score is computed and visible

If all green, drive to the stable.

## What "good enough for the field study" looks like in 30 days

- 50+ sessions logged across multiple horses
- Quality scores averaging > 0.8
- Riders engaging with label review
- Zero data loss events
- Algorithm freelancer has read-write access to algorithms repo and has improved at least one module

You are now sitting on a high-value equine welfare dataset. Time to write the thesis chapter.

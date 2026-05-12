# Session handoff — Polar PMD ingest (slices 13.A + 13.E)

## Status: COMPLETE & VERIFIED. Uncommitted on branch `slice-13.A-13.E-pmd-ingest`.

## Verification gates (all green)
- `npm run typecheck` — clean
- `npm run lint` — clean (1 pre-existing warning in tests/helpers/wake-lock-mock.ts, not from this work)
- `npm test -- --run` — 263/263 pass across 31 files (was 187 → +76 new tests)

## What was built
Plumbing only. Captures HR + ACC (200 Hz, ±8 G, int16) + ECG (130 Hz, int32 µV) every session, fully silent, retry-once on PMD failure then continue HR-only. 30-second binary chunks → Supabase Storage `signal-blobs` bucket + `signal_chunks` index table.

### Created (production, ~890 LOC)
- web/supabase/migrations/022_drop_per_sample_signal_tables.sql
- web/supabase/migrations/023_signal_chunks.sql
- web/supabase/migrations/023_signal_chunks_storage.sql (manual-apply: bucket + RLS)
- web/lib/ble/pmd-protocol.ts
- web/lib/ble/acc-codec.ts
- web/lib/ble/ecg-codec.ts
- web/lib/ble/pmd-session.ts
- web/lib/ble/signal-batcher.ts
- web/lib/api/chunk-helpers.ts
- web/app/api/ingest/chunk-url/route.ts
- web/app/api/ingest/chunk-commit/route.ts

### Created (tests, ~1,128 LOC, 76 new cases)
- web/tests/ble-pmd-protocol.test.ts
- web/tests/ble-acc-codec.test.ts
- web/tests/ble-ecg-codec.test.ts
- web/tests/chunk-helpers.test.ts
- web/tests/ble-signal-batcher.test.ts
- web/tests/ingest-chunk-url.test.ts
- web/tests/ingest-chunk-commit.test.ts

### Modified (7 files, +257/−5)
- web/lib/ble/connection.ts — PMD UUID in optionalServices
- web/lib/ble/use-ingest-session.ts — wires ACC + ECG streams (+174 lines)
- web/components/ble/PairButton.tsx — exposes server in onConnected
- web/components/ble/BleTestPanel.tsx — matching onConnected signature
- web/components/session/SessionRecorder.tsx — server ref + passes to ingest.start
- web/lib/supabase/types.ts — added signal_chunks Row/Insert/Update
- web/types/web-bluetooth.d.ts — added writeValueWithResponse / writeValueWithoutResponse

## Manual steps required before production
1. Apply migrations 022 + 023 (`supabase db push` or equivalent)
2. Run web/supabase/migrations/023_signal_chunks_storage.sql in Supabase Studio SQL editor (creates the `signal-blobs` bucket and storage RLS policies)
3. Real-hardware end-to-end smoke test on a Polar Equine band (un-automatable, was the 13.A end-to-end gate)

## Decisions locked in this session
- Scope: 13.A + 13.E together (skipped 13.0 hardware spike, skipped algorithm slices 13.B–G, skipped admin-export 13.H)
- Branch: new branch `slice-13.A-13.E-pmd-ingest` from main
- UX visibility: fully silent (no UI for PMD streams)
- Failure mode: retry once, then continue HR-only

## Where data is observable today
- Supabase Studio → Table editor → `signal_chunks` (one row per 30 s chunk per stream)
- Supabase Storage → `signal-blobs` bucket → `<session_id>/<acc|ecg>/<6-digit>.bin`
- NOT visible in admin UI (admin UI doesn't exist on main; admin-dashboard-mvp branch is unmerged)

## Admin-dashboard subdomain (user's last question)
The unmerged `admin-dashboard-mvp` branch already includes a host-aware proxy (`web/proxy.ts` + `web/lib/proxy/admin-host.ts`) that supports `admin.<domain>` on the SAME Vercel deployment. Recommended path:
1. Merge `admin-dashboard-mvp` → main
2. Vercel → Project → Settings → Domains → add `admin.polarequine.com`
3. DNS CNAME → cname.vercel-dns.com
4. Proxy detects host, rewrites `/sessions/x` → `/admin/sessions/x` automatically
5. Admin gating via ADMIN_EMAILS env-var (already in place)

A separate Vercel project is possible but discouraged (cookie domain, deploy drift).

## Recommended next steps (in order)
1. **Commit + push current branch + open PR** for 13.A + 13.E
2. **Merge admin-dashboard-mvp to main** so an admin UI exists at all
3. **Build slice 13.H** — admin raw-export.zip route + button (the freelancer's path in)
   - New: web/app/api/admin/sessions/[id]/raw-export.zip/route.ts
   - New: web/app/api/admin/sessions/[id]/raw-manifest.json/route.ts
   - Modify: admin session detail page (add Raw Export section)
   - Add `archiver` npm dep
4. **Algorithm slices 13.B–G** turn raw bytes into rider-visible metrics

## Open questions for next session
- Commit + push now, or wait?
- Order of operations: land 13.A+E first, then admin-dashboard-mvp, then 13.H? Or rebase 13.A+E onto admin-dashboard-mvp first?
- Want a quick inline ACC/ECG waveform preview on the admin session page (not in plan but easy)?

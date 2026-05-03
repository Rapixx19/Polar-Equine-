# web/ — La Fattoria PWA + admin

Next.js 16 (App Router) + TypeScript + Tailwind v4. Deployed to Vercel with **root directory = `web/`**.

> ⚠️ Next.js 16 has breaking API changes vs Next 14. When in doubt, read `node_modules/next/dist/docs/`.

---

## Run locally

```bash
npm install
cp .env.local.example .env.local       # paste ALGO_BEARER_TOKEN
npm run dev                             # http://localhost:3000

# In a second terminal:
supabase start                          # local Postgres for slice 2+ migrations
```

Smoke test the bearer round-trip (requires `algo/` running on :8787):
```bash
curl -i http://localhost:3000/api/smoke
# → 200 {"ok":true,"algo":{"status":"ok","algo_version":"0.1.0"}}
```

---

## Layout

```
web/
├── app/
│   ├── (auth)/page.tsx              # welcome screen (email + consent)
│   ├── (auth)/auth/sent/page.tsx    # "check your inbox" + iPhone Bluefy hint
│   ├── (auth)/auth/callback/route.ts # Route Handler — exchanges magic-link code → session cookies
│   ├── (auth)/auth/provision/page.tsx # display-name capture for new riders
│   ├── (auth)/auth/error/page.tsx   # expired / invalid link
│   ├── (rider)/home/page.tsx        # rider home — activity tile picker
│   ├── (rider)/start/horse/page.tsx # RLS-filtered horse picker
│   ├── (rider)/session/new/page.tsx # combined connect + record + end
│   ├── (rider)/session/[id]/saved/page.tsx # post-session confirmation
│   ├── (rider)/ble-test/page.tsx    # BLE smoke/dev page — Android Chrome only for now
│   ├── api/auth/{magic-link,provision-rider,logout}/route.ts
│   ├── api/sessions/route.ts        # POST start session (idempotent on client_session_id)
│   ├── api/sessions/[id]/route.ts   # PATCH end / notes
│   ├── api/ingest/samples/route.ts  # POST HR samples → samples_hr (RLS-enforced)
│   ├── api/smoke/route.ts           # web → algo bearer round-trip
│   └── layout.tsx                   # next-app default
├── components/auth/                 # EmailInput, ProvisionForm, LogoutButton
├── components/ble/                  # PairButton, ConnectionStatus, UnsupportedBanner, RecordingControls, BleTestPanel
├── components/session/              # ActivityTile, HorseTile, SessionRecorder
├── lib/
│   ├── api-client.ts                # algoFetch — adds bearer header
│   ├── api/session-helpers.ts       # zod schemas shared by sessions routes
│   ├── api/ingest-validation.ts     # zod schema for /api/ingest/samples wire format
│   ├── auth/{server,browser,admins}.ts # Supabase ssr clients + admin allow-list
│   ├── ble/{hr-codec,connection}.ts # 0x2A37 decoder + Web Bluetooth wrapper
│   ├── ble/batcher.ts               # 2s in-memory HR batcher (IndexedDB queue = Slice 18)
│   ├── ble/use-ingest-session.ts    # React hook: session lifecycle + batcher orchestration
│   ├── env.ts                       # lazy env-var validation
│   ├── activities.ts                # 7-type activity tuple (single source of truth)
│   ├── horses/server.ts             # RLS-scoped horses fetch helper
│   ├── sessions/saved-summary.ts    # pure-fn guards for /session/[id]/saved
│   └── supabase/types.ts            # generated DB types — regenerate after every migration
├── proxy.ts                         # Next 16 proxy — refreshes Supabase session each request
├── public/
│   ├── manifest.json                # PWA manifest (icons stubbed)
│   └── sw.js                        # Service Worker stub (full SW = Slice 18)
├── supabase/                        # local dev DB + migrations
│   └── migrations/                  # 001_init.sql … 010_sessions_update_rls.sql
├── tests/
│   └── *.test.ts                    # vitest: smoke + auth + sessions
├── scripts/
│   └── verify-slice-7.sql           # patched smoke-test verification query (Slice 7)
├── package.json  tsconfig.json  vitest.config.ts
└── vercel.json                      # buildCommand + crons (cron filled in Slice 10)
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev with Turbopack on :3000 |
| `npm run build` | Production build (also what Vercel runs) |
| `npm run start` | Serve production build locally |
| `npm run lint` | ESLint (Next config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (one-shot) |
| `npm run gen:types` | Regenerate `lib/supabase/types.ts` from the live schema |
| `supabase start` | Local Postgres + Studio (when in `web/`) |

---

## Env vars

| Name | Where | What |
|---|---|---|
| `ALGO_BASE_URL` | server-only | Base URL for algo service. Local: `http://localhost:8787`. Prod: `https://algo.lafattoria.app` |
| `ALGO_BEARER_TOKEN` | server-only | Shared secret with algo. Generated once in Slice 1 — stored in 1Password |
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Slice 3 — Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Slice 3 — Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | client+server | Slice 3 — origin used for magic-link `emailRedirectTo` |
| `ADMIN_EMAILS` | server-only | Slice 3 — comma-separated admin allow-list |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Slice 15+ (admin routes only) |
| `CRON_SECRET` | server-only | Slice 10 (Rule 14 — required header on `/api/cron/*`) |

`.env.local` is gitignored. Vercel env vars are set in the Vercel dashboard.

---

## After every migration

Regenerate the typed client so server routes pick up new tables/columns:

```bash
npm run gen:types
```

(Or, when working through Claude Code with the Supabase MCP enabled, ask Claude to call `mcp__supabase__generate_typescript_types`.)

Commit `lib/supabase/types.ts` alongside the migration file. CI will fail typecheck if they drift.

---

## Deploy

Connect this repo to Vercel with **Root Directory = `web/`**. Vercel auto-detects `next` and uses `vercel.json` for build/cron config.

<!-- ci-trigger: web-only path filter check (slice 1 verification) -->

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
│   ├── (auth)/page.tsx              # placeholder welcome (Slice 3 replaces)
│   ├── api/smoke/route.ts           # web → algo bearer round-trip
│   └── layout.tsx                   # next-app default
├── lib/
│   ├── api-client.ts                # algoFetch — adds bearer header
│   ├── env.ts                       # lazy env-var validation
│   ├── activities.ts                # 7-type activity tuple (single source of truth)
│   └── supabase/types.ts            # generated DB types — regenerate after every migration
├── public/
│   ├── manifest.json                # PWA manifest (icons stubbed)
│   └── sw.js                        # Service Worker stub (full SW = Slice 18)
├── supabase/                        # local dev DB + migrations
│   └── migrations/                  # 001_init.sql … 007_anomaly_flags.sql
├── tests/
│   └── smoke.test.ts                # vitest: mocks fetch, asserts _smoke route
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
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Slice 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Slice 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Slice 2 (admin routes only) |
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

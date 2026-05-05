# shared/01 · Environment Variables

Every secret and config knob across both repos. Manually synced for V.0; managed via a secrets manager (1Password, Doppler) in V.1.

## `lafattoria-web` (Vercel)

```bash
# Public — exposed to browser, prefixed NEXT_PUBLIC_
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...     # safe to expose
NEXT_PUBLIC_APP_URL=https://lafattoria.app        # for magic-link redirect
NEXT_PUBLIC_APP_NAME=La Fattoria

# Server-only — never prefixed NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...         # bypasses RLS; admin-only ops
ADMIN_EMAILS=admin1@example.com,admin2@example.com  # comma-separated allowlist
ALGO_BASE_URL=https://algo.lafattoria.app
ALGO_BEARER_TOKEN=                                # generated random 64-char string
CRON_SECRET=                                      # bearer for /api/cron/* (Slice 8+)

# Optional
SENTRY_DSN=                                       # error tracking
RESEND_API_KEY=                                   # if customizing email sender
```

## `lafattoria-algo` (Railway)

```bash
# Supabase (service role for full DB access)
SUPABASE_URL=https://xxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# Auth — token web sends to us
ALGO_BEARER_TOKEN=                                # MUST match web's value

# Versioning
ALGO_VERSION=0.1.0

# Optional
LOG_LEVEL=INFO
SENTRY_DSN=
```

## How they connect

| Web sends | To | With | Algo verifies |
|---|---|---|---|
| `Authorization: Bearer ${ALGO_BEARER_TOKEN}` | `${ALGO_BASE_URL}/compute` | HTTP POST | `req.token == ALGO_BEARER_TOKEN` |

Both `ALGO_BEARER_TOKEN` values must be **identical**. Generate once, paste into both Vercel and Railway dashboards. Rotation = generate new value, paste both, redeploy both.

## .env files (local development)

`lafattoria-web/.env.local` (gitignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321         # local supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...                    # local
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=eyJh...                        # local
ADMIN_EMAILS=ferdinand@dev.local
ALGO_BASE_URL=http://localhost:8000
ALGO_BEARER_TOKEN=dev-token-not-for-prod
```

`lafattoria-algo/.env` (gitignored):

```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=eyJh...
ALGO_BEARER_TOKEN=dev-token-not-for-prod
ALGO_VERSION=dev
LOG_LEVEL=DEBUG
```

## Generating secrets

```bash
# ALGO_BEARER_TOKEN
openssl rand -base64 48

# Local Supabase service role key — generated automatically by `supabase start`
```

## Committing pattern

- `.env.example` files committed in both repos with placeholder values and comments
- `.env`, `.env.local`, `.env.production` are all in `.gitignore`
- Production values entered via Vercel UI and Railway UI

## Vercel-specific notes

- `NEXT_PUBLIC_*` vars are baked into the build; changing requires a redeploy
- Server-only vars are runtime-injected; changing requires a restart but no rebuild
- Use Vercel's "Production" / "Preview" / "Development" scoping to differentiate environments

## Railway-specific notes

- All Railway env vars are runtime-injected
- Restart automatically picks up new values
- For preview-environment testing, create a separate Railway project pointing at a separate Supabase database

## Audit trail

Whenever a secret is rotated, document in `shared/03-incident-response.md` the why and when. For V.0 this is informal (a Notion doc); for V.1 (post-research) this lives in a real audit system.

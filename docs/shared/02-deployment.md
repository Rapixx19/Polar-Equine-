# shared/02 · Deployment

How both repos go from `git push` to live URLs.

## Initial provisioning (one-time setup)

### 1. Domains

- Buy `lafattoria.app` from any registrar (Cloudflare or Namecheap recommended, ~€15/yr)
- Plan to point apex `lafattoria.app` at Vercel and `algo.lafattoria.app` subdomain at Railway

### 2. Supabase project

- Sign up at supabase.com
- Create a project named `lafattoria-prod`
- Region: `eu-central-1` (Frankfurt) for GDPR + low latency to Switzerland
- Plan: start on Free; upgrade to Pro (€25/mo) once data volume requires it (~30 days in)
- Copy the URL and anon/service-role keys for env vars
- Apply migrations: `supabase db push` from the web repo

### 3. Vercel project

- Sign up at vercel.com (free Hobby plan is fine for V.0)
- Import the `lafattoria-web` GitHub repo
- Build command: `npm run build`
- Output directory: `.next` (default)
- Add environment variables (per `shared/01-environment-variables.md`)
- Add custom domain: `lafattoria.app`
- Vercel handles HTTPS automatically via Let's Encrypt

### 4. Railway project

- Sign up at railway.app
- New project from `lafattoria-algo` GitHub repo
- Service: `algo`
- Build: Dockerfile-based (committed in repo)
- Add environment variables
- Add custom domain: `algo.lafattoria.app`
- Railway provisions HTTPS automatically
- Plan: start on Hobby (€5/mo); scale up if needed

## Post-deployment checklist

After every production deploy, verify:

```bash
# Health checks
curl https://lafattoria.app                          # → 200, returns landing page
curl https://algo.lafattoria.app/health              # → 200, {"status":"ok"}

# Auth flow
curl -X POST https://lafattoria.app/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@lafattoria.dev"}'              # → {"sent":true}

# Algo handshake (using prod token)
curl -X POST https://algo.lafattoria.app/compute \
  -H "Authorization: Bearer $ALGO_BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"00000000-0000-0000-0000-000000000000"}'
                                                     # → 404 (session not found, but auth works)
```

## CI/CD flow

```
┌───────────┐     ┌──────────────────┐     ┌──────────────┐
│  push to  │────▶│  GitHub Actions  │────▶│  Vercel /    │
│   main    │     │  (test + lint)   │     │  Railway     │
│           │     │                  │     │  auto-deploy │
└───────────┘     └──────────────────┘     └──────────────┘
                          │
                          │ on PR
                          ▼
                  ┌────────────────────┐
                  │  Preview deploy    │
                  │  (Vercel: PR URL)  │
                  │  (Railway: env)    │
                  └────────────────────┘
```

Each repo:
- `.github/workflows/test.yml` runs on every push and PR
- Push to `main` triggers production auto-deploy on Vercel/Railway
- PRs get preview deploys (Vercel ships them by default; Railway requires "PR environments" enabled)

## Database migrations in production

Web repo owns the migrations. Workflow:

```bash
# 1. Locally, write the new migration
echo "-- 007_add_notes.sql ..." > supabase/migrations/007_add_notes.sql

# 2. Test locally
supabase db reset    # drop and replay all
npm run test

# 3. Push to remote (production Supabase)
supabase link --project-ref xxxxxxx
supabase db push

# 4. Deploy code that uses the new schema (push to main)
git push origin main
```

Migrations are NOT triggered by Vercel deploys — they happen separately, deliberately.

**Order matters:** schema changes ALWAYS go before code changes that use them. Otherwise users see errors during the deployment window.

## Rollback procedure

### Web rollback

In Vercel dashboard → Deployments tab → find previous green deployment → click "Promote to Production". Takes < 30 seconds.

### Algo rollback

In Railway dashboard → Deployments tab → find previous deploy → "Redeploy". Takes ~2 minutes.

### Database rollback

For schema changes: write a new migration that reverses the change. **Never** edit the original migration. For data corruption: restore from Supabase point-in-time recovery (Pro plan).

## Cost expectations for V.0

| Service | Plan | Cost/month |
|---|---|---|
| Domain | annual | ~€1 |
| Supabase | Free → Pro at month 2 | €0 → €25 |
| Vercel | Hobby (free) | €0 |
| Railway | Hobby | ~€5 |
| Resend (email) | free 100/day | €0 |
| **Total V.0** | | **~€30/month** |

## Monitoring (V.0 minimum)

- Vercel built-in: deployment success/failure
- Railway built-in: service uptime
- Supabase built-in: database query stats, auth events
- Sentry (free Developer plan): error tracking in both repos
- Manual: weekly check of Vercel/Railway logs for errors

V.1 monitoring upgrade: add structured log aggregation (Logtail, Axiom), uptime probing (Better Stack), real metrics dashboard (Grafana Cloud free tier).

## Backup strategy

- Supabase Pro plan includes daily backups (7-day retention by default, extendable)
- Manual export script (in `lafattoria-algo/scripts/export.py`) dumps all sessions + samples to a Parquet file weekly
- Backup files stored in Supabase Storage in a separate bucket

## DNS configuration

```
lafattoria.app           → Vercel (CNAME or A record per Vercel docs)
www.lafattoria.app       → 308 redirect to lafattoria.app
algo.lafattoria.app      → Railway (CNAME)
```

DNS managed at the registrar (or Cloudflare for better caching/DDoS).

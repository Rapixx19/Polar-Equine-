# 03 · Auth and Permissions

## Three identities, three flows

| Identity | Auth | Where | Sees |
|---|---|---|---|
| Rider | Magic link via email | PWA at `/` | Their own sessions, horses they're authorized for |
| Admin | Magic link + admin flag | Admin at `/admin` | Everything |
| Algo service | Bearer token (incoming only) | Verifies bearer on requests from web cron | n/a — algo doesn't call web |

## Magic link flow (rider sign-in)

```
1. Rider opens lafattoria.app on phone
2. PWA shows "Enter your email"
3. Rider types: anna@chc-horses.ch
4. PWA POSTs /api/auth/magic-link { email }
5. Supabase Auth sends email with magic link
6. Email contains link: lafattoria.app/auth/callback?token=...
7. Rider taps link → opens in their default browser
   ⚠ iPhone catch: must open in Bluefy if Bluetooth needed
   → solution: PWA explains "after logging in, return to Bluefy and reload"
8. Callback validates token, sets Supabase session cookie
9. PWA detects logged-in state, shows home screen
10. Cookie persists 90 days; no re-login needed
```

## Email infrastructure

Supabase Auth handles email sending out of the box:
- Default sender: `noreply@lafattoria.app`
- Email template customizable in Supabase dashboard
- Production: configure SMTP via Resend or SendGrid for deliverability

## First-time rider provisioning

When a new rider first logs in:

1. Supabase creates `auth.users` row
2. PWA POSTs `/api/auth/provision-rider` with display name
3. Server creates `rider_profiles` row linked to `auth.users.id`
4. Server checks if email matches admin allowlist (env var `ADMIN_EMAILS`)
5. If admin: sets `is_admin = true`
6. Returns rider profile to PWA
7. PWA navigates to home

## Horse-rider permissions

A rider can only:
- See horses they have a row for in `horse_riders`
- Start sessions for horses they have a row for
- See their own sessions

An admin can:
- See all horses, sessions, riders
- Grant horse-rider permissions
- Add/remove horses, bands, riders

### Granting permissions

Admin opens `/admin/horses/[id]` → "Authorized riders" section → adds rider by email. If rider account doesn't exist yet, system creates a placeholder; on their first login the placeholder is upgraded to a full account.

### Default for V.0

For V.0 (single-stable deployments), default approach:
- Project owner + designated co-admin = admin role (configured via `ADMIN_EMAILS` env var)
- All authorized riders are auto-granted access to all horses in the deployment
- Multi-stable permission isolation ships in V.2

### Algo service auth

The Python algo service authenticates **outgoing** requests to web (rare/none in V.0) and **incoming** requests from web's cron runner.

For incoming (web → algo), the algo service verifies the bearer token on every request:

```python
# In algo service config
WEB_INGEST_TOKEN = os.environ['ALGO_BEARER_TOKEN']

# FastAPI dependency on every route
async def verify_bearer(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer")
    if authorization.replace("Bearer ", "") != WEB_INGEST_TOKEN:
        raise HTTPException(401, "Invalid bearer")
```

Token is identical in Vercel env (used by web cron runner) and Railway env (used by algo to verify). One-way dependency: algo never calls web.

Token rotation: change in both Vercel and Railway env vars, redeploy both. Manual for V.0; automated via secrets manager in V.2.

## Cookie and session management

| Cookie | Purpose | Lifetime |
|---|---|---|
| `sb-access-token` | Supabase access token (JWT) | 1 hour, auto-refreshed |
| `sb-refresh-token` | Supabase refresh token | 90 days |
| `lf-rider-id` | Cached rider profile ID | 90 days |

All cookies are `Secure`, `HttpOnly`, `SameSite=Lax`.

## Logout

Rider taps "Log out" in PWA settings:
1. PWA calls `supabase.auth.signOut()`
2. Cookies cleared
3. PWA redirects to `/` (welcome / sign-in screen)

Logout does NOT delete data — sessions remain in DB linked to the rider's account. They can log back in any time.

## Privacy and data deletion

For V.0 (research framing):
- All riders sign a consent form when first granted access (admin-managed)
- Consent records linked to `rider_profiles.consented_at` (shipped in `001_init.sql`; populated by `/api/auth/provision-rider` in Slice 3)
- Riders can request data deletion via email to admin
- GDPR-compliant deletion: cascading delete from `rider_profiles` removes all their sessions, samples, labels

For V.1 / commercial:
- In-app data deletion request flow
- 30-day soft-delete with recovery period
- Audit log of deletions

## Why magic links and not passwords

- **No password reset flows** to maintain
- **No password DB column** to leak
- **Faster onboarding** — type email, tap link, in
- **Shared phones at the stable** OK — each rider authenticates per session
- **WhatsApp-distributable** — "open this link, enter your email, you're in"
- Industry standard for low-frequency-use professional tools (Notion, Slack invites, etc.)

## Edge cases

| Situation | Behavior |
|---|---|
| Rider's magic link expires (1 hour) | Show "Link expired, request a new one" |
| Rider tries to log in from a new device | Magic link sent to email; works on any device |
| Two riders share a phone | Either logs out and other logs in; or use separate browsers |
| Rider forgets their email | Admin looks them up by display name, resends invite |
| Email delivery delayed/spam | Settings option to retry, plus admin can send a one-time password |
| Rider's email changes | Admin can update via admin dashboard |
| Rider is a minor | Out of scope for V.0; revisit in V.1 with parental consent flow |

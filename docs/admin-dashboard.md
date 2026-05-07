# Admin Dashboard (V0)

Read-only operations view at `/admin`. Lets the project lead inspect every session, horse, and compute job across all riders without dropping into Supabase Studio.

## Routes

| Path | Purpose |
|---|---|
| `/admin` | Redirects to `/admin/sessions`. |
| `/admin/sessions` | Paginated list of every session. Filters: `?status=…&metrics=…&page=N`. |
| `/admin/sessions/[id]` | Single-session deep-dive: header, status row, full `session_metrics`, `compute_jobs`, first 100 `samples_hr`, manual recompute curl. |
| `/admin/horses` | All horses visible to the admin. |
| `/admin/horses/[id]` | Horse-scoped sessions list (reuses sessions table). |
| `/admin/jobs` | `compute_jobs` queue, defaults to `?status=failed`. |

## Access control

The route group `(admin)` is gated by `assertAdmin()` in `web/lib/auth/server.ts`:

1. No user → redirect to `/`.
2. User without `rider_profiles` row → redirect to `/auth/provision`.
3. User with `is_admin = false` → redirect to `/home` (soft, no leaky 403).
4. User with `is_admin = true` → render the admin shell.

`is_admin` is set on `rider_profiles` at provision time when the user's email is in the `ADMIN_EMAILS` env CSV (case-insensitive). To grant admin to a new email:

1. Add it to `ADMIN_EMAILS` in Vercel project settings.
2. Redeploy.
3. The next time that user signs in and provisions, their profile will be created with `is_admin = true`. For an already-provisioned user, flip the flag manually in Supabase Studio.

## RLS, not service-role

Reads use the same anon-key `createServerSupabaseClient()` as the rider UI. Every relevant RLS policy already includes `OR is_admin_check()` (see migrations 005, 010, 011, 013), so the admin's normal Supabase client returns all rows. **No service-role key is used in the admin read path.** This minimises blast radius if the admin session is ever compromised.

## Adding a new admin view

1. Add a query helper in `web/lib/admin/queries.ts`. Keep `supabase` as the first argument so a future research/freelancer slice can pass a different client.
2. Add a server-rendered page under `web/app/(admin)/admin/<thing>/page.tsx`. The route-group layout already runs `assertAdmin()`, so the page can call `createServerSupabaseClient()` directly.
3. Add a nav entry in `web/components/admin/AdminNav.tsx` if it deserves a top-level tab.
4. Tests: pure helper tests in `web/tests/admin-queries.test.ts` mocking `supabase` per the existing fluent-builder pattern.

## What's deliberately not here

- **Mutations.** No edit/delete/recompute buttons. Use Supabase Studio or the printed `curl /recompute` command.
- **Charts beyond HR-over-time.** The session detail page now renders an HR line chart from up to 5,000 samples; deeper visuals (zone bars, RR-interval timeline, etc.) reuse the rider-side components from slice 11.8 once those land.
- **Filtering UI beyond URL params.** Date pickers, search-by-name, etc. land in slice 16+.
- **Real-time.** Page reload is fine for V0.
- **Admin user-management UI.** `ADMIN_EMAILS` env + redeploy is the source of truth, by design.

## Hosting on a separate subdomain

The admin dashboard can be served from a subdomain (e.g. `admin.sentavita.app`) on the same Vercel project. The proxy at `web/proxy.ts` detects the host and rewrites short paths (`/sessions`, `/horses`, `/jobs`) to their `/admin/...` equivalents, so on the subdomain the URL bar stays clean. Pure routing logic lives in `web/lib/proxy/admin-host.ts` and is unit-tested in `web/tests/admin-host.test.ts`.

Behaviour by host:

| Host | `/` | `/sessions/[id]` | `/admin/jobs` | `/home` |
|---|---|---|---|---|
| `sentavita.app` (main) | sign-in | 404 | admin (auth-gated) | rider home |
| `admin.sentavita.app` | sign-in (redirects admins straight to `/admin/sessions`) | rewrites to `/admin/sessions/[id]` | admin (auth-gated, no rewrite) | rider home (fallback for non-admins, kept for the `/home` redirect chain) |

Sign-in flow on the admin subdomain: `/` shows the same email/password form. After successful auth, both `(auth)/page.tsx` and `(rider)/home/page.tsx` check the host and redirect admins to `/admin/sessions`. Non-admins land on rider home as usual.

### One-time setup (Vercel + DNS)

1. **Vercel → Project → Settings → Domains.** Add `admin.<your-domain>`. Vercel will tell you the CNAME or A record to set.
2. **DNS provider.** Add the requested record. Wait for propagation (typically ≤5 min).
3. **`NEXT_PUBLIC_APP_URL`.** No change needed — auth callback URLs still target the canonical host. Sign-in works on the subdomain because the proxy passes through `/auth/*` and `/api/*` unchanged, and the Supabase callback uses the absolute `NEXT_PUBLIC_APP_URL` for emails (so password-reset links land on the main domain). If you'd rather have password-reset links land on the admin subdomain, add a separate Vercel preview env or branch-scoped env, not a global override.
4. **Test.** Visit `admin.<your-domain>/sessions` — should render the admin sessions list (after sign-in). Visit `<your-domain>/sessions` — should still 404 (no rider route at that path).

The proxy is a no-op on any host that doesn't start with `admin.` or `admin-`, so this change is safe to ship without Vercel domain config in place.

## Freelancer dashboard — separate, future scope

Per `feedback_freelancer_access.md`, freelancer access is **not** a role-gated tab inside this admin UI. The freelancer dashboard ships in a separate slice once the engagement is confirmed (M0 gate: reproducing `session_metrics` from anonymised inputs). It will:

- Live under a `(research)` route group.
- Use a separate read-only DB role + an anonymised view (`'horse_' || substr(id::text, 1, 8)` and `'rider_' || substr(id, 1, 8)`).
- Reuse the `web/lib/admin/queries.ts` helpers by passing a different `supabase` client.

Never expose `horses.name` or `rider_profiles.display_name` to a freelancer via the admin UI.

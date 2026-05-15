# shared/14 · Slice 17 — Compliance + security gate

## Why this exists

Before any non-Ferdinand rider records a session against production Supabase,
we need a defensible record that:

1. Rider A's data is invisible to rider B (RLS works end-to-end).
2. `compute_jobs` is admin-read-only.
3. Realtime publication is not silently leaking rows.
4. A rider can self-export their data (GDPR right of access).

This doc is the verification log. Mark each box as it's checked.

---

## 1. Two-rider RLS verification

**Status:** ⏳ pending — needs phone B to arrive.

Procedure when phone B is in hand:

1. Create rider B in Supabase Studio (admin-managed; per
   `project_supabase_email_confirm_off.md`, Confirm-email is OFF).
2. Log into rider B on phone B. Note rider A's `session_id` from your own
   session list.
3. Hit `/sessions/<rider-A-session-id>` in the browser → must 404 / "no
   session".
4. From rider B's signed-in fetch context (devtools console):

   ```js
   await fetch('/api/sessions/<rider-A-session-id>/labels').then(r => r.status)
   // expect: 403 or 404, never 200
   ```

5. Run via Supabase JS client (in console with rider B's session):

   ```js
   const { data } = await supabase.from('samples_hr')
     .select('id').eq('session_id', '<rider-A-session-id>');
   // expect: data === [] (RLS filters all rows)
   ```

6. Record the outcome in this file under "Verification log" below.

---

## 2. `compute_jobs` RLS

**Status:** ✅ shipped (migration `011_compute_jobs.sql:27–31`).

Policy is `admins read compute_jobs` with `is_admin_check()`; service role
(cron + algo) bypasses RLS so the worker still runs.

Spot-check from rider B's session when phone arrives:

```js
await supabase.from('compute_jobs').select('*');
// expect: data === [] (no admin = no rows)
```

---

## 3. Realtime publication

**Status:** ✅ effectively disabled.

Verified 2026-05-15 via the Supabase MCP:

```sql
select pubname, puballtables from pg_publication
  where pubname = 'supabase_realtime';
-- pubname=supabase_realtime, puballtables=false

select schemaname, tablename from pg_publication_tables
  where pubname = 'supabase_realtime';
-- []  (zero tables)
```

The `supabase_realtime` publication exists but has no member tables, so no
INSERT/UPDATE/DELETE events stream to any subscriber, signed-in or not. The
admin "Live now" tab uses 3 s polling (`LiveSessionsBanner.tsx`,
`LiveStatusBar.tsx`), so the app does not depend on Realtime.

**Rule for V.0:** Do NOT add tables to `supabase_realtime` without first
designing per-channel auth. If V.1 wants Realtime back, see
`V1_BACKLOG.md`.

---

## 4. GDPR self-export

**Status:** ✅ shipped — `GET /api/me/export`
(`web/app/api/me/export/route.ts`).

Authenticated GET → JSON dump of the caller's own data:
- `rider_profile` (own row)
- `horses` (RLS filters to authorized horses only)
- `sessions` (own)
- `samples_hr` / `samples_acc` / `samples_ecg` (joined by own session_id, RLS
  enforced)
- `session_metrics` / `session_signal_events` / `label_corrections`

Filename: `my-data-<YYYY-MM-DD>.json`. No anonymisation — this is the rider's
own data including their display name. Test: `web/tests/me-export.test.ts`.

---

## Verification log

| Date | Item | Result | Notes |
|---|---|---|---|
| 2026-05-15 | Realtime publication audit | ✅ empty | via `pg_publication_tables` |
| 2026-05-15 | `compute_jobs` RLS shipped | ✅ | migration 011 |
| 2026-05-15 | `/api/me/export` shipped | ✅ | 5/5 vitest pass |
| TBD | Two-rider RLS — phone B | ⏳ | run procedure §1 |

Add a row each time a verification is repeated or a new rider is onboarded.

---

## When this conflicts with `04-v0-mission.md`

`04-v0-mission.md` wins. If something in this doc would slow down collect /
clean / classify, fix this doc.

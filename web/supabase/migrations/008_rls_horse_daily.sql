-- 008_rls_horse_daily.sql — close two security advisor findings from slice 2.
--
-- 1) horse_daily was missing RLS (it is exposed via PostgREST). The spec block
--    in 005 did not enable it; this migration fixes that with a SELECT policy
--    keyed to horse_riders membership, mirroring the horses-table policy.
-- 2) is_admin_check() lacked a fixed search_path (advisor 0011) — set it to
--    pg_catalog, public so a malicious schema cannot shadow rider_profiles.

alter table horse_daily enable row level security;

create policy "riders read authorized horse_daily"
  on horse_daily for select
  using (
    exists (select 1 from horse_riders
            where horse_riders.horse_id = horse_daily.horse_id
              and horse_riders.rider_id = auth.uid())
    or is_admin_check()
  );

create or replace function is_admin_check() returns boolean
  language sql
  stable
  security definer
  set search_path = pg_catalog, public
as $$
  select coalesce((select is_admin from rider_profiles where id = auth.uid()), false)
$$;

-- is_admin_check is intended for use inside RLS policies, not as a public RPC.
-- Revoke EXECUTE from PostgREST roles to silence advisors 0028 / 0029.
revoke execute on function is_admin_check() from anon, authenticated, public;

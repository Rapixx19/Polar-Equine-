-- Admins manage other riders' quotas and program end dates via the /admin UI.
-- The existing "riders update own profile" policy only allows id = auth.uid(),
-- so admins can't update other rows. Add a parallel policy gated by
-- is_admin_check() so admins can update any rider_profile.
--
-- SELECT for admins already works: the existing "riders see own profile"
-- policy is (id = auth.uid()) OR is_admin_check().

create policy "admins update any rider_profile"
  on rider_profiles for update
  using (is_admin_check())
  with check (is_admin_check());

comment on policy "admins update any rider_profile" on rider_profiles is
  'Lets is_admin riders edit other riders'' session_quota_target, '
  'program_end_date, etc. via the /admin UI. The own-profile UPDATE policy '
  'still covers self-edits for non-admins.';

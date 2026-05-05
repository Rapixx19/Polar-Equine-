-- 015_rider_profiles_self_insert.sql — let an authenticated user create and
-- update their own rider_profiles row. 005 only granted SELECT, which made
-- /auth/provision return 500 on first sign-in. The check matches auth.uid()
-- so the policy is self-scoped and admins still rely on service-role.
create policy "riders insert own profile"
  on rider_profiles for insert
  with check (id = auth.uid());

create policy "riders update own profile"
  on rider_profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

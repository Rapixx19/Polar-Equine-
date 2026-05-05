-- 010_sessions_update_rls.sql — riders may update their own sessions (PATCH end).
-- 005_rls_policies.sql shipped INSERT + SELECT but not UPDATE; PATCH end requires UPDATE.

create policy "riders update own sessions"
  on sessions for update
  using (rider_id = auth.uid() or is_admin_check())
  with check (rider_id = auth.uid() or is_admin_check());

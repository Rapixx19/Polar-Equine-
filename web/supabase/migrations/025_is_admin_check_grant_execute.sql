-- Migration 008 revoked EXECUTE on is_admin_check() from authenticated/anon to
-- silence the PostgREST advisors that flagged it as a publicly-callable RPC.
-- The revoke was too aggressive: RLS policies on rider_profiles, horse_daily,
-- and others reference is_admin_check() inside their USING clause. Without
-- EXECUTE, any authenticated user hitting those policies sees error 42501
-- ("permission denied for function is_admin_check") and the operation fails —
-- including the first-login provision-rider upsert that returns the row via
-- .single() (the SELECT-back triggers the policy check).
--
-- The function is SECURITY DEFINER with a fixed search_path, so granting
-- EXECUTE back to authenticated is safe: callers cannot inject privileges
-- through it, they can only ask "am I an admin?" about themselves.
-- The PostgREST advisor noise is acceptable; correctness wins.

grant execute on function public.is_admin_check() to authenticated;

comment on function public.is_admin_check() is
  'Returns true when the calling rider has is_admin=true in rider_profiles. '
  'Used inside RLS policies on rider_profiles, horse_daily, and others. '
  'EXECUTE is granted to authenticated despite advisors 0028/0029 because '
  'RLS policy evaluation requires the calling role to reference the function.';

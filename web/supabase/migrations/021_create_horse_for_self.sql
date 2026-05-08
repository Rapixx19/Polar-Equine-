-- 021: Self-serve horse creation for authenticated riders.
-- A rider provides a name; we create the horses row + horse_riders link
-- atomically. No new RLS policies on horses/horse_riders are added.
-- This is a SECURITY DEFINER function so it can bypass the (still strict)
-- INSERT policies on those tables.

create or replace function public.create_horse_for_self(p_name text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(p_name);
  v_horse_id uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) = 0 or length(v_name) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  -- Require the rider_profiles row to exist (provisioned on first login).
  if not exists (select 1 from public.rider_profiles where rider_profiles.id = v_uid) then
    raise exception 'no_rider_profile' using errcode = '23503';
  end if;

  insert into public.horses (name, created_by)
  values (v_name, v_uid)
  returning horses.id into v_horse_id;

  insert into public.horse_riders (horse_id, rider_id, role, granted_by)
  values (v_horse_id, v_uid, 'rider', v_uid);

  return query select v_horse_id, v_name;
end;
$$;

revoke all on function public.create_horse_for_self(text) from public;
grant execute on function public.create_horse_for_self(text) to authenticated;

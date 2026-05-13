-- 024: Self-serve creation of one-off / guest horses.
-- Mirrors 021's create_horse_for_self but stamps the horses row with
-- is_guest=true + last_used_at=now() so the new horse immediately shows up
-- in the "recent guests" section of the start-session picker.
--
-- Separate function (rather than overloading 021) so the call sites stay
-- explicit about intent — adding a permanent horse and adding a one-off
-- horse are different user actions on different surfaces.

create or replace function public.create_guest_horse_for_self(p_name text)
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
  if not exists (select 1 from public.rider_profiles where rider_profiles.id = v_uid) then
    raise exception 'no_rider_profile' using errcode = '23503';
  end if;

  insert into public.horses (name, created_by, is_guest, last_used_at)
  values (v_name, v_uid, true, now())
  returning horses.id into v_horse_id;

  insert into public.horse_riders (horse_id, rider_id, role, granted_by)
  values (v_horse_id, v_uid, 'rider', v_uid);

  return query select v_horse_id, v_name;
end;
$$;

revoke all on function public.create_guest_horse_for_self(text) from public;
grant execute on function public.create_guest_horse_for_self(text) to authenticated;

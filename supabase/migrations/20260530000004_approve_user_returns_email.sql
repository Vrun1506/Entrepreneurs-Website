-- ════════════════════════════════════════════════════════════════════
-- Foundry · approve_user returns email + first_name
--
-- reject_user (migration 6) already returns the rejected user's email
-- so the admin action can send a notification without a second round
-- trip. approve_user did not — meaning when an admin approves an alum
-- application, the user never knew, and if they'd closed their tab,
-- they had no signal at all.
--
-- This switches approve_user to mirror reject_user's shape so the
-- admin action can fire the acceptance email in the same pattern.
-- Return type changes from void → table, so the function is dropped
-- first.
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.approve_user(uuid, text);

create or replace function public.approve_user(
  p_user_id uuid,
  p_notes   text default null
)
returns table (email text, first_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  update public.profiles set status = 'approved' where id = p_user_id;
  if not found then
    raise exception 'Profile not found: %', p_user_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_user', 'profiles', p_user_id, p_notes);

  return query
    select u.email::text, p.first_name
      from auth.users u
      join public.profiles p on p.id = u.id
     where u.id = p_user_id;
end;
$$;

grant execute on function public.approve_user(uuid, text) to authenticated;

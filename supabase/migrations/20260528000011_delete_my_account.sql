-- ════════════════════════════════════════════════════════════════════
-- Foundry · Self-service account deletion
--
-- Authenticated users can delete their own account. Cascade from
-- auth.users → public.profiles → profile_skills, profile_sectors
-- handles the public-schema cleanup automatically.
--
-- SECURITY DEFINER so the function can reach into auth.users without
-- granting broader privileges to the authenticated role.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from auth.users where id = v_caller;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

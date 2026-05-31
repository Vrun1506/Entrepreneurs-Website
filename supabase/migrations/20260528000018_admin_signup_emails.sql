-- ════════════════════════════════════════════════════════════════════
-- Foundry · Admin signup-email lookup
--
-- Admin queue pages need to show the poster's signup email next to each
-- submission. auth.users is not exposed via PostgREST, so we provide a
-- SECURITY DEFINER helper that returns the email for a batch of user IDs.
-- Gated to admins.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_get_signup_emails(p_user_ids uuid[])
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  return query
    select au.id, au.email::text
      from auth.users au
     where au.id = any(p_user_ids);
end;
$$;

grant execute on function public.admin_get_signup_emails(uuid[]) to authenticated;

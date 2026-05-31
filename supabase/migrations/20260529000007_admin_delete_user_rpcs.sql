-- ════════════════════════════════════════════════════════════════════
-- Foundry · Admin-driven account deletion RPCs
--
-- Two operations on the same primitive:
--   1. admin_delete_user(uuid, text)
--      Search-and-delete one specific user (e.g. policy violations).
--      Returns (email, first_name) so the server action can send a
--      "your account was removed — here's why" notification email.
--   2. admin_delete_graduates(int)
--      Batch-delete all current students whose grad_year <= cutoff
--      AND status='approved'. Returns the (email, first_name) of each
--      so the server action can send a "congrats on graduating, reapply
--      as alum if you want to stay" email per row.
--
-- Both reuse the same logic as delete_my_account (migration 4) for
-- clearing listings + admin_actions before the auth.users cascade. Both
-- write to admin_actions so the audit trail captures who did what.
--
-- Admins cannot delete their own account via admin_delete_user — they
-- have to use the self-service /settings flow. This is a guardrail, not
-- security: the function rejects v_user_id = v_caller.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. admin_delete_user ────────────────────────────────────────────
create or replace function public.admin_delete_user(
  p_user_id uuid,
  p_reason  text
)
returns table(email text, first_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
  v_first  text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;

  if p_user_id = v_caller then
    raise exception 'Use the self-service Delete Account flow to delete your own account';
  end if;

  -- Capture identity before the cascade wipes it.
  select au.email::text, p.first_name into v_email, v_first
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = p_user_id;

  if v_email is null then
    raise exception 'User not found: %', p_user_id;
  end if;

  -- Same blocking-FK cleanup as delete_my_account.
  delete from public.opportunities where posted_by = p_user_id;
  delete from public.events        where posted_by = p_user_id;
  delete from public.vcs_grants    where posted_by = p_user_id;
  delete from public.admin_actions where admin_id  = p_user_id;

  -- Cascades to profiles, profile_skills, profile_sectors, admins.
  delete from auth.users where id = p_user_id;

  -- Audit. Note this is logged against the deleter, with the deleted
  -- user's id captured in target_id.
  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_delete_user', 'auth.users', p_user_id, p_reason);

  return query select v_email, v_first;
end;
$$;

revoke all on function public.admin_delete_user(uuid, text) from public;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- ─── 2. admin_delete_graduates ───────────────────────────────────────
-- Returns one row per deleted student so the server action can iterate
-- and send a congrats-on-graduating email to each.
create or replace function public.admin_delete_graduates(
  p_cutoff_year int
)
returns table(user_id uuid, email text, first_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_count  int;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_cutoff_year is null or p_cutoff_year < 1950 or p_cutoff_year > 2099 then
    raise exception 'Cutoff year must be between 1950 and 2099';
  end if;

  -- Materialise the set of doomed users so we can audit + email after
  -- the deletes finish.
  create temporary table _to_delete on commit drop as
    select p.id as user_id, au.email::text as email, p.first_name
      from public.profiles p
      join auth.users au on au.id = p.id
     where p.role = 'student'
       and p.status = 'approved'
       and p.grad_year is not null
       and p.grad_year <= p_cutoff_year;

  select count(*) into v_count from _to_delete;

  if v_count = 0 then
    return;
  end if;

  -- Clear blocking FKs for the entire cohort in one statement each.
  delete from public.opportunities where posted_by in (select user_id from _to_delete);
  delete from public.events        where posted_by in (select user_id from _to_delete);
  delete from public.vcs_grants    where posted_by in (select user_id from _to_delete);
  delete from public.admin_actions where admin_id  in (select user_id from _to_delete);

  -- Cascade-delete the auth rows themselves.
  delete from auth.users where id in (select user_id from _to_delete);

  -- Audit: one row per deleted graduate.
  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  select v_caller,
         'admin_delete_graduate',
         'auth.users',
         td.user_id,
         'Graduate cleanup, cutoff_year=' || p_cutoff_year
    from _to_delete td;

  return query
    select td.user_id, td.email, td.first_name from _to_delete td;
end;
$$;

revoke all on function public.admin_delete_graduates(int) from public;
grant execute on function public.admin_delete_graduates(int) to authenticated;

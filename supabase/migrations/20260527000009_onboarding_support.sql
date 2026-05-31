-- ════════════════════════════════════════════════════════════════════
-- Foundry · Onboarding support
--
-- 1. Loosen the status-protect trigger so users can complete their own
--    onboarding (the one transition they're allowed to perform without
--    admin intervention).
-- 2. submit_onboarding(...) RPC — first-time profile setup. Atomic.
--    alum → pending_review (manual admin verification)
--    student → approved (Imperial-email gated; no manual review needed)
-- 3. update_profile(...) RPC — subsequent edits at /profile. Never
--    touches status.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Trigger: allow self pending_onboarding → pending_review/approved
create or replace function public.tg_profiles_protect_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    -- User completing their own onboarding: one-way ratchet from
    -- pending_onboarding into either pending_review (alum) or approved
    -- (student). Anything else from the user is rejected.
    if new.id = auth.uid()
       and old.status = 'pending_onboarding'
       and new.status in ('pending_review', 'approved') then
      return new;
    end if;
    raise exception 'Only admins can change profile status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── 2. submit_onboarding ────────────────────────────────────────────
-- Called once per user. Validates required fields, replaces skill/sector
-- selections, and flips status atomically. The grad_year CHECK constraint
-- (post-migration 7) enforces alum-must-have, student-must-not at the
-- moment status leaves pending_onboarding.
create or replace function public.submit_onboarding(
  p_linkedin_url text,
  p_grad_year    int,
  p_bio          text,
  p_working_on   text,
  p_skill_ids    smallint[],
  p_sector_ids   smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_role      user_role;
  v_status    user_status;
  v_new_status user_status;
  v_linkedin  text;
  v_bio       text;
  v_working   text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role, status into v_role, v_status
    from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending_onboarding' then
    raise exception 'Onboarding already submitted' using errcode = '22023';
  end if;

  v_linkedin := nullif(trim(p_linkedin_url), '');
  if v_linkedin is null then
    raise exception 'LinkedIn URL is required';
  end if;

  v_bio     := nullif(trim(coalesce(p_bio, '')), '');
  v_working := nullif(trim(coalesce(p_working_on, '')), '');

  v_new_status := case v_role
    when 'alum'    then 'pending_review'::user_status
    when 'student' then 'approved'::user_status
  end;

  update public.profiles
     set linkedin_url = v_linkedin,
         grad_year    = case when v_role = 'alum' then p_grad_year else null end,
         bio          = v_bio,
         working_on   = v_working,
         status       = v_new_status
   where id = v_caller;

  delete from public.profile_skills  where profile_id = v_caller;
  delete from public.profile_sectors where profile_id = v_caller;

  if p_skill_ids is not null and array_length(p_skill_ids, 1) > 0 then
    insert into public.profile_skills (profile_id, skill_id)
    select v_caller, unnest(p_skill_ids)
    on conflict do nothing;
  end if;

  if p_sector_ids is not null and array_length(p_sector_ids, 1) > 0 then
    insert into public.profile_sectors (profile_id, sector_id)
    select v_caller, unnest(p_sector_ids)
    on conflict do nothing;
  end if;
end;
$$;

-- ─── 3. update_profile ───────────────────────────────────────────────
-- Used by /profile after onboarding. Same fields as onboarding plus
-- first_name / surname. Never touches status.
create or replace function public.update_profile(
  p_first_name   text,
  p_surname      text,
  p_linkedin_url text,
  p_grad_year    int,
  p_bio          text,
  p_working_on   text,
  p_skill_ids    smallint[],
  p_sector_ids   smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_role   user_role;
  v_first  text;
  v_last   text;
  v_linkedin text;
  v_bio    text;
  v_working text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  v_first    := nullif(trim(coalesce(p_first_name, '')), '');
  v_last     := nullif(trim(coalesce(p_surname,    '')), '');
  v_linkedin := nullif(trim(coalesce(p_linkedin_url, '')), '');
  v_bio      := nullif(trim(coalesce(p_bio,          '')), '');
  v_working  := nullif(trim(coalesce(p_working_on,   '')), '');

  if v_first is null then raise exception 'First name is required'; end if;
  if v_last  is null then raise exception 'Surname is required';    end if;
  if v_linkedin is null then raise exception 'LinkedIn URL is required'; end if;
  if v_role = 'alum' and p_grad_year is null then
    raise exception 'Graduation year is required for alumni';
  end if;

  update public.profiles
     set first_name   = v_first,
         surname      = v_last,
         linkedin_url = v_linkedin,
         grad_year    = case when v_role = 'alum' then p_grad_year else null end,
         bio          = v_bio,
         working_on   = v_working
   where id = v_caller;

  delete from public.profile_skills  where profile_id = v_caller;
  delete from public.profile_sectors where profile_id = v_caller;

  if p_skill_ids is not null and array_length(p_skill_ids, 1) > 0 then
    insert into public.profile_skills (profile_id, skill_id)
    select v_caller, unnest(p_skill_ids)
    on conflict do nothing;
  end if;

  if p_sector_ids is not null and array_length(p_sector_ids, 1) > 0 then
    insert into public.profile_sectors (profile_id, sector_id)
    select v_caller, unnest(p_sector_ids)
    on conflict do nothing;
  end if;
end;
$$;

-- ─── 4. reject_user — change return type to include email + first_name
-- Replaces the void-returning version in migration 3 so the admin server
-- action can send a rejection email without a second round-trip / lookup.
-- DROP is required because Postgres won't let CREATE OR REPLACE change
-- a function's return signature.
drop function if exists public.reject_user(uuid, text);

create or replace function public.reject_user(
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
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  update public.profiles set status = 'rejected' where id = p_user_id;
  if not found then
    raise exception 'Profile not found: %', p_user_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_user', 'profiles', p_user_id, p_reason);

  return query
    select au.email::text, p.first_name
      from auth.users au
      join public.profiles p on p.id = au.id
     where au.id = p_user_id;
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function public.submit_onboarding(text, int, text, text, smallint[], smallint[]) to authenticated;
grant execute on function public.update_profile(text, text, text, int, text, text, smallint[], smallint[]) to authenticated;
grant execute on function public.reject_user(uuid, text) to authenticated;

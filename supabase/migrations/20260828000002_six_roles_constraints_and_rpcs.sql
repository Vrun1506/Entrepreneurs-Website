-- ════════════════════════════════════════════════════════════════════
-- Foundry · Six roles — constraint and RPC rules
--
-- RUN THIS AS A SEPARATE BATCH FROM 20260828000001. Postgres refuses to
-- use an enum value in the same transaction that added it.
--
-- role is not a display attribute on this table — it decides admission.
-- submit_onboarding maps a role to a status, and a BEFORE UPDATE trigger
-- locks the column because a user-writable role was a HIGH finding in
-- 20260603000001 (an alum could flip to student and self-approve). Adding
-- four values therefore has to answer three questions explicitly.
--
-- 1. WHICH ROLES AUTO-APPROVE?
--    Only 'student', and only against a verified Imperial address. The
--    status map below is now an allow-list with an ELSE — the previous
--    CASE had no ELSE, so any role outside {alum, student} would have
--    yielded NULL and hit the NOT NULL on status. That failed safe by
--    accident; this fails safe on purpose, and a new role added later
--    lands in pending_review rather than in the directory.
--
-- 2. WHICH ROLES HAVE A GRADUATION YEAR?
--    student, recent_grad and alum. A mentor, angel or staff member has
--    no meaningful graduation year, and the live constraint
--    (status = 'pending_onboarding' or grad_year is not null) would have
--    forced one on them at approval. Rewritten below.
--
-- 3. WHICH ROLES MUST SUPPLY A LINKEDIN URL?
--    Everyone except 'student'. This is the existing rule's own logic,
--    not a new policy: alumni were asked for LinkedIn because they have
--    no Imperial address to verify them against. That is equally true of
--    recent grads, mentors, angels and staff, and it matters more now
--    that invite codes are not being built.
--
-- Both functions are recreated from their latest live definitions
-- (20260603000001) with only the role branches changed, matching the
-- exact argument signatures so this REPLACES them rather than creating
-- dead overloads. CREATE OR REPLACE preserves the ACLs set by
-- 20260608000001.
--
-- admin_delete_graduates was reviewed and is NOT changed: it sweeps
-- approved students past their graduation year, and 'student' is still
-- exactly the set it should touch.
-- ════════════════════════════════════════════════════════════════════

-- ─── Graduation-year consistency, role-aware ─────────────────────────
-- Previous rule required grad_year of every onboarded profile regardless
-- of role. NOT VALID for the same reason the previous one was: it does
-- not re-check the 28 existing rows, all of which satisfy it anyway.
alter table public.profiles
  drop constraint if exists profiles_grad_year_role_consistency;

alter table public.profiles
  add constraint profiles_grad_year_role_consistency check (
    status = 'pending_onboarding'
    or role in ('mentor', 'angel', 'staff_faculty')
    or grad_year is not null
  ) not valid;

-- ─── submit_onboarding ───────────────────────────────────────────────
create or replace function public.submit_onboarding(
  p_course        text,
  p_grad_year     int,
  p_linkedin_url  text,
  p_github_url    text,
  p_portfolio_url text,
  p_bio           text,
  p_working_on    text,
  p_skill_ids     smallint[],
  p_sector_ids    smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_role         user_role;
  v_status       user_status;
  v_new_status   user_status;
  v_current_year int := extract(year from now())::int;
  v_course       text;
  v_linkedin     text;
  v_github       text;
  v_portfolio    text;
  v_bio          text;
  v_working      text;
  v_needs_year   boolean;
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

  -- A student is auto-approved by the status map below, so re-verify the
  -- Imperial domain here — the last line of defence behind the signup-time
  -- check and the role lock. auth.users is schema-qualified because the
  -- function pins search_path = public.
  if v_role = 'student' and not public.is_imperial_email(
       (select email from auth.users where id = v_caller)) then
    raise exception 'Student accounts must use an @imperial.ac.uk or @ic.ac.uk email address.'
      using errcode = '42501';
  end if;

  v_course    := nullif(trim(coalesce(p_course,        '')), '');
  v_linkedin  := nullif(trim(coalesce(p_linkedin_url,  '')), '');
  v_github    := nullif(trim(coalesce(p_github_url,    '')), '');
  v_portfolio := nullif(trim(coalesce(p_portfolio_url, '')), '');
  v_bio       := nullif(trim(coalesce(p_bio,           '')), '');
  v_working   := nullif(trim(coalesce(p_working_on,    '')), '');

  if v_course is null then
    raise exception 'Course is required';
  end if;

  v_needs_year := v_role in ('student', 'recent_grad', 'alum');

  if v_needs_year and p_grad_year is null then
    raise exception 'Graduation year is required';
  end if;

  -- Role-aware graduation-year bounds. now()-based, so not expressible as
  -- a CHECK constraint.
  if v_role = 'student' and p_grad_year < v_current_year + 1 then
    raise exception 'Students must set an expected graduation year of % or later', v_current_year + 1
      using errcode = '22023';
  end if;
  if v_role in ('recent_grad', 'alum') and p_grad_year > v_current_year then
    raise exception 'Graduation year cannot be in the future once you have graduated'
      using errcode = '22023';
  end if;

  -- LinkedIn stands in for the Imperial address every non-student lacks.
  if v_role <> 'student' and v_linkedin is null then
    raise exception 'A LinkedIn URL is required for accounts without an Imperial email address';
  end if;

  -- Allow-list, default deny. Adding a role without touching this line
  -- puts it in the review queue, which is the safe direction.
  v_new_status := case
    when v_role = 'student' then 'approved'::user_status
    else 'pending_review'::user_status
  end;

  -- Mark this transaction as a trusted onboarding-submission call so
  -- the protect-status trigger lets the status flip through. Local to
  -- this transaction (3rd arg = true); cleared automatically at COMMIT
  -- and not visible to any other session.
  perform set_config('foundry.onboarding_submission', 'true', true);

  update public.profiles
     set course        = v_course,
         grad_year     = case when v_needs_year then p_grad_year else null end,
         linkedin_url  = v_linkedin,
         github_url    = v_github,
         portfolio_url = v_portfolio,
         bio           = v_bio,
         working_on    = v_working,
         status        = v_new_status
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

-- ─── update_profile ──────────────────────────────────────────────────
create or replace function public.update_profile(
  p_first_name    text,
  p_surname       text,
  p_course        text,
  p_grad_year     int,
  p_linkedin_url  text,
  p_github_url    text,
  p_portfolio_url text,
  p_bio           text,
  p_working_on    text,
  p_skill_ids     smallint[],
  p_sector_ids    smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller       uuid := auth.uid();
  v_role         user_role;
  v_current_year int := extract(year from now())::int;
  v_first        text;
  v_last         text;
  v_course       text;
  v_linkedin     text;
  v_github       text;
  v_portfolio    text;
  v_bio          text;
  v_working      text;
  v_needs_year   boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  v_first     := nullif(trim(coalesce(p_first_name,    '')), '');
  v_last      := nullif(trim(coalesce(p_surname,       '')), '');
  v_course    := nullif(trim(coalesce(p_course,        '')), '');
  v_linkedin  := nullif(trim(coalesce(p_linkedin_url,  '')), '');
  v_github    := nullif(trim(coalesce(p_github_url,    '')), '');
  v_portfolio := nullif(trim(coalesce(p_portfolio_url, '')), '');
  v_bio       := nullif(trim(coalesce(p_bio,           '')), '');
  v_working   := nullif(trim(coalesce(p_working_on,    '')), '');

  if v_first    is null then raise exception 'First name is required';      end if;
  if v_last     is null then raise exception 'Surname is required';         end if;
  if v_course   is null then raise exception 'Course is required';          end if;
  if length(v_first) > 50 or length(v_last) > 50 then
    raise exception 'First name and surname must be 50 characters or fewer';
  end if;
  -- Reject digits and symbol-soup. Letters (any script), spaces, hyphens,
  -- apostrophes and periods are absent from this class, so they pass.
  if v_first ~ '[0-9@£$%^&*()+=/{}<>!?#~_;:",|]'
     or v_last ~ '[0-9@£$%^&*()+=/{}<>!?#~_;:",|]' then
    raise exception 'First name and surname can only contain letters, spaces, hyphens, apostrophes and periods';
  end if;

  v_needs_year := v_role in ('student', 'recent_grad', 'alum');

  if v_needs_year and p_grad_year is null then
    raise exception 'Graduation year is required';
  end if;
  if v_role = 'student' and p_grad_year < v_current_year + 1 then
    raise exception 'Students must set an expected graduation year of % or later', v_current_year + 1
      using errcode = '22023';
  end if;
  if v_role in ('recent_grad', 'alum') and p_grad_year > v_current_year then
    raise exception 'Graduation year cannot be in the future once you have graduated'
      using errcode = '22023';
  end if;
  if v_role <> 'student' and v_linkedin is null then
    raise exception 'A LinkedIn URL is required for accounts without an Imperial email address';
  end if;

  update public.profiles
     set first_name    = v_first,
         surname       = v_last,
         course        = v_course,
         grad_year     = case when v_needs_year then p_grad_year else null end,
         linkedin_url  = v_linkedin,
         github_url    = v_github,
         portfolio_url = v_portfolio,
         bio           = v_bio,
         working_on    = v_working
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

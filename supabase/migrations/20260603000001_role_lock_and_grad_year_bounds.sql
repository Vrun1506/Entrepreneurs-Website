-- ════════════════════════════════════════════════════════════════════
-- Foundry · Lock profiles.role + role-aware graduation-year bounds
--
-- Two fixes in one migration (both touch the same RPCs):
--
-- 1. 🔴 HIGH — profiles.role was user-writable.
--    profiles_update_own RLS lets a user UPDATE any column on their own
--    row (id = auth.uid()). status is already protected by
--    tg_profiles_protect_status (20260531000003), but role was NOT — so a
--    user could PostgREST-UPDATE their own role. Combined with
--    submit_onboarding's role→status map (student ⇒ approved, no domain
--    check), an alum could flip role to 'student' and self-approve,
--    bypassing the manual alumni review queue entirely.
--    Fix: a BEFORE UPDATE trigger that rejects any role change unless the
--    caller is service_role or an admin (mirrors the status trigger).
--    role is only ever set at profile creation (tg_handle_new_user) — no
--    legitimate user-facing UPDATE path touches it — so this is safe.
--
--    submit_onboarding also re-checks the Imperial domain for students at
--    the moment of auto-approval, so even a role flip that slipped through
--    can't yield an approved non-Imperial student.
--
-- 2. Role-aware graduation-year bounds (product requirement):
--      alum    → grad_year <= current_year   (already graduated)
--      student → grad_year >= current_year+1  (still studying)
--    These depend on now(), which a CHECK constraint can't use (must be
--    IMMUTABLE), so they live in the RPCs (+ the frontend dropdowns). The
--    existing 1950..2099 CHECK stays as the absolute floor/ceiling.
--
-- Both submit_onboarding (9-arg) and update_profile (11-arg) are recreated
-- VERBATIM from their latest live definitions (20260601000000 and
-- 20260602000003 respectively) with only the new checks added, matching
-- the exact argument signatures so this REPLACES the live functions rather
-- than creating dead overloads.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1a. Role-protect trigger ────────────────────────────────────────
create or replace function public.tg_profiles_protect_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    raise exception 'Only admins can change a member''s role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.tg_profiles_protect_role();

-- Belt-and-braces column revoke. NOTE: this is effectively a no-op while
-- `authenticated` holds a table-level UPDATE grant (Postgres column-level
-- REVOKE only bites when there is no table-level grant), so the trigger
-- above is the real guarantee. Kept so intent is explicit and the column
-- stays locked if the table grant is ever narrowed.
revoke update (role) on public.profiles from authenticated;

-- ─── 1b/2. submit_onboarding (9-arg) — domain re-check + grad bounds ──
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
  if p_grad_year is null then
    raise exception 'Graduation year is required';
  end if;
  -- Role-aware graduation-year bounds (see header). now()-based, so not
  -- expressible as a CHECK constraint.
  if v_role = 'student' and p_grad_year < v_current_year + 1 then
    raise exception 'Students must set an expected graduation year of % or later', v_current_year + 1
      using errcode = '22023';
  end if;
  if v_role = 'alum' and p_grad_year > v_current_year then
    raise exception 'Graduation year cannot be in the future for alumni'
      using errcode = '22023';
  end if;
  if v_role = 'alum' and v_linkedin is null then
    raise exception 'LinkedIn URL is required for alumni';
  end if;

  v_new_status := case v_role
    when 'alum'    then 'pending_review'::user_status
    when 'student' then 'approved'::user_status
  end;

  -- Mark this transaction as a trusted onboarding-submission call so
  -- the protect-status trigger lets the status flip through. Local to
  -- this transaction (3rd arg = true); cleared automatically at COMMIT
  -- and not visible to any other session.
  perform set_config('foundry.onboarding_submission', 'true', true);

  update public.profiles
     set course        = v_course,
         grad_year     = p_grad_year,
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

grant execute on function public.submit_onboarding(text, int, text, text, text, text, text, smallint[], smallint[]) to authenticated;

-- ─── 2. update_profile (11-arg) — grad bounds ───────────────────────
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
  if p_grad_year is null then
    raise exception 'Graduation year is required';
  end if;
  -- Role-aware graduation-year bounds (see header). now()-based, so not
  -- expressible as a CHECK constraint.
  if v_role = 'student' and p_grad_year < v_current_year + 1 then
    raise exception 'Students must set an expected graduation year of % or later', v_current_year + 1
      using errcode = '22023';
  end if;
  if v_role = 'alum' and p_grad_year > v_current_year then
    raise exception 'Graduation year cannot be in the future for alumni'
      using errcode = '22023';
  end if;
  if v_role = 'alum' and v_linkedin is null then
    raise exception 'LinkedIn URL is required for alumni';
  end if;

  update public.profiles
     set first_name    = v_first,
         surname       = v_last,
         course        = v_course,
         grad_year     = p_grad_year,
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

grant execute on function public.update_profile(text, text, text, int, text, text, text, text, text, smallint[], smallint[]) to authenticated;

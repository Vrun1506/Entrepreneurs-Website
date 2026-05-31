-- ════════════════════════════════════════════════════════════════════
-- Foundry · Onboarding expansion
--
-- Adds course + portfolio_url to profiles. Makes graduation year
-- required for both roles (students used to be forbidden from having
-- one) so we can power course/year-based filtering later. LinkedIn is
-- now optional for students; alumni still require it for admin vetting.
--
-- New columns are nullable in the schema so pending_onboarding rows can
-- exist before the user has filled anything in. Required-on-submit
-- enforcement lives in submit_onboarding and in CHECK constraints gated
-- by status.
-- ════════════════════════════════════════════════════════════════════

-- ─── New columns ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists course text;

alter table public.profiles
  add column if not exists portfolio_url text;

-- ─── Constraints ─────────────────────────────────────────────────────
-- course: bounded length (allows null, so safe on existing rows).
alter table public.profiles
  drop constraint if exists profiles_course_len;

alter table public.profiles
  add constraint profiles_course_len check (
    course is null or length(course) between 1 and 200
  );

-- course required once onboarded. Pre-existing approved/pending_review rows
-- predate this column and have course=null; mark NOT VALID so they're
-- grandfathered while still enforcing the rule for new writes. Existing
-- users will fill the field in next time they hit /profile (the
-- update_profile RPC requires it). Run
--   alter table public.profiles validate constraint
--     profiles_course_required_post_onboarding;
-- once backfill is complete.
alter table public.profiles
  drop constraint if exists profiles_course_required_post_onboarding;

alter table public.profiles
  add constraint profiles_course_required_post_onboarding check (
    status = 'pending_onboarding' or course is not null
  ) not valid;

-- portfolio_url: generic http(s) prefix (portfolios live on any domain).
-- Allows null, safe on existing rows.
alter table public.profiles
  drop constraint if exists profiles_portfolio_url_format;

alter table public.profiles
  add constraint profiles_portfolio_url_format check (
    portfolio_url is null or portfolio_url ~* '^https?://'
  );

-- grad_year: required for *both* roles once onboarded. The previous rule
-- forbade grad_year on students, so existing approved student rows have
-- grad_year=null and would violate this. NOT VALID same as above; run
--   alter table public.profiles validate constraint
--     profiles_grad_year_role_consistency;
-- after backfill.
alter table public.profiles
  drop constraint if exists profiles_grad_year_role_consistency;

alter table public.profiles
  add constraint profiles_grad_year_role_consistency check (
    status = 'pending_onboarding' or grad_year is not null
  ) not valid;

-- ─── submit_onboarding ───────────────────────────────────────────────
-- Signature changes (new p_course, p_portfolio_url; LinkedIn rule role-
-- conditional). Drop the old signature first since CREATE OR REPLACE
-- can't change parameter lists.
drop function if exists public.submit_onboarding(text, text, int, text, text, smallint[], smallint[]);

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
  v_caller     uuid := auth.uid();
  v_role       user_role;
  v_status     user_status;
  v_new_status user_status;
  v_course     text;
  v_linkedin   text;
  v_github     text;
  v_portfolio  text;
  v_bio        text;
  v_working    text;
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
  if v_role = 'alum' and v_linkedin is null then
    raise exception 'LinkedIn URL is required for alumni';
  end if;

  v_new_status := case v_role
    when 'alum'    then 'pending_review'::user_status
    when 'student' then 'approved'::user_status
  end;

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

-- ─── update_profile ──────────────────────────────────────────────────
-- Same field additions; same LinkedIn-required-for-alum-only rule.
drop function if exists public.update_profile(text, text, text, text, int, text, text, smallint[], smallint[]);

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
  v_caller    uuid := auth.uid();
  v_role      user_role;
  v_first     text;
  v_last      text;
  v_course    text;
  v_linkedin  text;
  v_github    text;
  v_portfolio text;
  v_bio       text;
  v_working   text;
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
  if p_grad_year is null then
    raise exception 'Graduation year is required';
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

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function public.submit_onboarding(text, int, text, text, text, text, text, smallint[], smallint[]) to authenticated;
grant execute on function public.update_profile(text, text, text, int, text, text, text, text, text, smallint[], smallint[]) to authenticated;

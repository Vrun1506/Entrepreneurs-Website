-- ════════════════════════════════════════════════════════════════════
-- Foundry · Close the onboarding-submission flag after the UPDATE
--
-- submit_onboarding raises foundry.onboarding_submission immediately
-- before flipping status, so tg_profiles_protect_status lets the change
-- through, and then never lowers it. set_config's third argument makes
-- the setting transaction-local, NOT statement-local: it stays raised
-- for the rest of the transaction.
--
-- This is not currently exploitable. PostgREST runs one transaction per
-- request and a single request cannot chain an RPC call and a direct
-- table write, so no caller can reach a second statement while the flag
-- is up. It is a latent hazard rather than a live hole — the same one
-- that WAS caught by the leak assertion in set_my_affiliation, which is
-- why that function closes its flag and this one now does too.
--
-- The body below is 20260828000002's definition verbatim, with two lines
-- added: the reset after the profiles UPDATE, and this note. The
-- signature is identical, so this REPLACES the live function rather than
-- creating a second overload beside it.
-- ════════════════════════════════════════════════════════════════════

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

  -- THE FIX. Lowered the moment the guarded UPDATE is done, so the
  -- statements below (the skill/sector rewrite) run with the flag down and
  -- nothing else in this transaction can ride through the status trigger
  -- on it. Mirrors set_my_affiliation, which resets for the same reason.
  perform set_config('foundry.onboarding_submission', 'false', true);

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

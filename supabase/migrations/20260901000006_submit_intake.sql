-- ════════════════════════════════════════════════════════════════════
-- Foundry · submit_intake / defer_intake, and the submit_onboarding shrink
--
-- THE SEQUENCING CHANGE THIS WHOLE PROJECT HINGES ON. Until now,
-- submit_onboarding wrote both identity (course, grad year, LinkedIn)
-- AND everything the admin review queue needs to see AND everything
-- the rich post-approval intake collects (bio, skills, sectors) in one
-- call, then flipped status. admin_list_pending_profiles reviews a
-- non-student on exactly those fields. Moving the rich fields behind
-- approval without touching submit_onboarding would leave that queue
-- rendering a name and an email.
--
-- So: submit_onboarding SHRINKS to identity only (course, grad_year,
-- linkedin, github, portfolio) and keeps flipping status — the admin
-- queue is unaffected. Everything else (photo/CV are already separate,
-- via confirm_avatar_upload/confirm_cv_upload) moves into submit_intake,
-- callable only once a member is 'approved'.
--
-- update_profile is extended with the same intake fields, because My
-- Profile must let all of it stay editable — it is self-description
-- that goes stale, and locking it guarantees a stale directory within
-- two terms.
--
-- Both submit_intake and update_profile share the actual write logic
-- via the private helper below, so the ~15-field write (profiles +
-- profile_skills + profile_sectors + profile_interests +
-- profile_intents) exists in exactly one place.
-- ════════════════════════════════════════════════════════════════════

-- ─── Shared internal write path ────────────────────────────────────
-- REVOKED from every role below. Callable only from inside another
-- SECURITY DEFINER function owned by the same role (this migration's
-- runner), which is how a Postgres owner's own functions can call each
-- other without a separate EXECUTE grant — PostgREST can never reach
-- this directly, by name, at all.
--
-- Column-level validation (lengths, enum membership) is left to the
-- CHECK constraints already on these columns (20260901000004/000005) —
-- consistent with how update_profile already defers to
-- profiles_bio_len etc. rather than re-checking in PL/pgSQL.
create or replace function public._apply_intake_fields(
  p_caller             uuid,
  p_preferred_name     text,
  p_bio_focus          text,
  p_bio_hobbies        text,
  p_current_focus      text,
  p_venture_stage      text,
  p_venture_name       text,
  p_venture_url        text,
  p_venture_one_liner  text,
  p_recruiting_status  text,
  p_intent_urgency     text,
  p_availability_hours text,
  p_skill_ids          smallint[],
  p_core_skill_ids     smallint[],
  p_sector_ids         smallint[],
  p_academic_interests text[],
  p_hobbies            text[],
  p_intents            text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preferred text;
  v_focus     text;
  v_hobbies   text;
begin
  v_preferred := nullif(trim(coalesce(p_preferred_name, '')), '');
  v_focus     := nullif(trim(coalesce(p_bio_focus,      '')), '');
  v_hobbies   := nullif(trim(coalesce(p_bio_hobbies,    '')), '');

  -- Core-skill and intent caps are enforced here, ahead of a bulk
  -- rewrite, rather than relying on profile_skills_cap_core /
  -- profile_intents_rank_range to catch it row-by-row mid-statement —
  -- a multi-row INSERT's per-row BEFORE trigger cannot reliably see
  -- sibling rows from the same statement.
  if p_core_skill_ids is not null and array_length(p_core_skill_ids, 1) > 3 then
    raise exception 'At most 3 core skills are allowed' using errcode = '22023';
  end if;
  if p_intents is not null and array_length(p_intents, 1) > 3 then
    raise exception 'You can rank at most 3 choices.' using errcode = '22023';
  end if;

  update public.profiles
     set preferred_name     = v_preferred,
         bio_focus          = v_focus,
         bio_hobbies        = v_hobbies,
         current_focus      = nullif(trim(coalesce(p_current_focus,      '')), ''),
         venture_stage      = nullif(trim(coalesce(p_venture_stage,      '')), ''),
         venture_name       = nullif(trim(coalesce(p_venture_name,       '')), ''),
         venture_url        = nullif(trim(coalesce(p_venture_url,        '')), ''),
         venture_one_liner  = nullif(trim(coalesce(p_venture_one_liner,  '')), ''),
         recruiting_status  = nullif(trim(coalesce(p_recruiting_status,  '')), ''),
         intent_urgency     = nullif(trim(coalesce(p_intent_urgency,     '')), ''),
         availability_hours = nullif(trim(coalesce(p_availability_hours, '')), '')
   where id = p_caller;

  -- Skills: full rewrite, is_core carried on the same row.
  delete from public.profile_skills where profile_id = p_caller;
  if p_skill_ids is not null and array_length(p_skill_ids, 1) > 0 then
    insert into public.profile_skills (profile_id, skill_id, is_core)
    select p_caller, s, (s = any(coalesce(p_core_skill_ids, '{}'::smallint[])))
      from unnest(p_skill_ids) as s
    on conflict do nothing;
  end if;

  -- Sectors: full rewrite, unchanged shape from the pre-existing path.
  delete from public.profile_sectors where profile_id = p_caller;
  if p_sector_ids is not null and array_length(p_sector_ids, 1) > 0 then
    insert into public.profile_sectors (profile_id, sector_id)
    select p_caller, unnest(p_sector_ids)
    on conflict do nothing;
  end if;

  -- Interests: full rewrite of both kinds. Empty-string entries are
  -- dropped rather than stored — profile_interests_label_len requires
  -- at least 1 character, so an empty array position would otherwise
  -- raise a constraint error the member did nothing to deserve.
  delete from public.profile_interests where profile_id = p_caller;
  if p_academic_interests is not null then
    insert into public.profile_interests (profile_id, kind, label)
    select p_caller, 'academic', trim(v)
      from unnest(p_academic_interests) as v
     where trim(coalesce(v, '')) <> '';
  end if;
  if p_hobbies is not null then
    insert into public.profile_interests (profile_id, kind, label)
    select p_caller, 'hobby', trim(v)
      from unnest(p_hobbies) as v
     where trim(coalesce(v, '')) <> '';
  end if;

  -- Intents: full rewrite, rank = position in the array the client
  -- already ordered by drag/tap order in the RankPicker.
  delete from public.profile_intents where profile_id = p_caller;
  if p_intents is not null and array_length(p_intents, 1) > 0 then
    insert into public.profile_intents (profile_id, intent, rank)
    select p_caller, intent, rank
      from unnest(p_intents) with ordinality as t(intent, rank);
  end if;
end;
$$;

revoke execute on function public._apply_intake_fields(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  smallint[], smallint[], smallint[], text[], text[], text[]
) from public, anon, authenticated;

-- ─── submit_intake ─────────────────────────────────────────────────
-- One-time completion of the post-approval intake. Callable only by an
-- approved member who has not already completed it — profile_version
-- moves 1 -> 2 exactly once; further edits go through update_profile.
create or replace function public.submit_intake(
  p_preferred_name     text,
  p_bio_focus          text,
  p_bio_hobbies        text,
  p_current_focus      text default null,
  p_venture_stage      text default null,
  p_venture_name       text default null,
  p_venture_url        text default null,
  p_venture_one_liner  text default null,
  p_recruiting_status  text default null,
  p_intent_urgency     text default null,
  p_availability_hours text default null,
  p_skill_ids          smallint[] default '{}',
  p_core_skill_ids     smallint[] default '{}',
  p_sector_ids         smallint[] default '{}',
  p_academic_interests text[] default '{}',
  p_hobbies            text[] default '{}',
  p_intents            text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_status  user_status;
  v_version smallint;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select status, profile_version into v_status, v_version
    from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if v_status <> 'approved' then
    raise exception 'Your membership must be approved before you can complete your profile'
      using errcode = '42501';
  end if;
  if v_version >= 2 then
    raise exception 'You have already completed this' using errcode = '22023';
  end if;

  perform public._apply_intake_fields(
    v_caller, p_preferred_name, p_bio_focus, p_bio_hobbies, p_current_focus,
    p_venture_stage, p_venture_name, p_venture_url, p_venture_one_liner,
    p_recruiting_status, p_intent_urgency, p_availability_hours,
    p_skill_ids, p_core_skill_ids, p_sector_ids,
    p_academic_interests, p_hobbies, p_intents
  );

  update public.profiles
     set profile_version    = 2,
         intake_completed_at = now(),
         intake_deferred_at  = null
   where id = v_caller;
end;
$$;

revoke execute on function public.submit_intake(
  text, text, text, text, text, text, text, text, text, text, text,
  smallint[], smallint[], smallint[], text[], text[], text[]
) from public, anon;
grant execute on function public.submit_intake(
  text, text, text, text, text, text, text, text, text, text, text,
  smallint[], smallint[], smallint[], text[], text[], text[]
) to authenticated;

-- ─── defer_intake ──────────────────────────────────────────────────
-- "Skip for now" at any screen of /intake. Lands the member on /home
-- with a dismissible prompt instead of a wall — see 20260901000004's
-- header comment for the full gate condition this feeds.
create or replace function public.defer_intake()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.profiles
     set intake_deferred_at = now()
   where id = v_caller
     and status = 'approved';
end;
$$;

revoke execute on function public.defer_intake() from public, anon;
grant  execute on function public.defer_intake() to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- submit_onboarding SHRINKS to identity only.
--
-- Signature changes (9 args -> 5), so the old overload must be DROPped
-- explicitly — CREATE OR REPLACE with a different parameter list creates
-- a second, dead overload instead of replacing the live one (the exact
-- trap 20260601000000 and 20260827000001 both name). Body below is
-- 20260828000005's, verbatim, with the bio/working_on/skills/sectors
-- reads, params, and rewrite blocks removed. The GUC bracket around the
-- status-flip UPDATE is UNCHANGED — that is the one thing in this
-- function that must not move.
-- ═══════════════════════════════════════════════════════════════════

drop function if exists public.submit_onboarding(
  text, int, text, text, text, text, text, smallint[], smallint[]
);

create or replace function public.submit_onboarding(
  p_course        text,
  p_grad_year     int,
  p_linkedin_url  text,
  p_github_url    text,
  p_portfolio_url text
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
         status        = v_new_status
   where id = v_caller;

  -- Lowered the moment the guarded UPDATE is done — nothing after this
  -- point should ride through the status trigger on it. Mirrors
  -- set_my_affiliation and 20260828000005's own fix.
  perform set_config('foundry.onboarding_submission', 'false', true);
end;
$$;

revoke execute on function public.submit_onboarding(text, int, text, text, text)
  from public, anon;
grant  execute on function public.submit_onboarding(text, int, text, text, text)
  to authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- update_profile EXTENDS to cover every intake field.
--
-- My Profile must let all of it stay editable — role/status/email are
-- the only three exceptions in this whole project, each already locked
-- elsewhere for the reason that they are what admission was granted on,
-- not self-description. Identity-field validation below is
-- 20260828000002's body verbatim; the new fields are handed to the same
-- _apply_intake_fields helper submit_intake uses, so the write logic
-- exists in exactly one place.
--
-- bio/working_on are NOT written here any more — the new ProfileForm
-- writes bio_focus/bio_hobbies, and 20260901000007's read-path cutover
-- already prefers those over the legacy columns once they are non-null.
-- ═══════════════════════════════════════════════════════════════════

drop function if exists public.update_profile(
  text, text, text, int, text, text, text, text, text, smallint[], smallint[]
);

create or replace function public.update_profile(
  p_first_name         text,
  p_surname            text,
  p_course             text,
  p_grad_year          int,
  p_linkedin_url       text,
  p_github_url         text,
  p_portfolio_url      text,
  p_preferred_name     text default null,
  p_bio_focus          text default null,
  p_bio_hobbies        text default null,
  p_current_focus      text default null,
  p_venture_stage      text default null,
  p_venture_name       text default null,
  p_venture_url        text default null,
  p_venture_one_liner  text default null,
  p_recruiting_status  text default null,
  p_intent_urgency     text default null,
  p_availability_hours text default null,
  p_skill_ids          smallint[] default '{}',
  p_core_skill_ids     smallint[] default '{}',
  p_sector_ids         smallint[] default '{}',
  p_academic_interests text[] default '{}',
  p_hobbies            text[] default '{}',
  p_intents            text[] default '{}'
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

  if v_first    is null then raise exception 'First name is required';      end if;
  if v_last     is null then raise exception 'Surname is required';         end if;
  if v_course   is null then raise exception 'Course is required';          end if;
  if length(v_first) > 50 or length(v_last) > 50 then
    raise exception 'First name and surname must be 50 characters or fewer';
  end if;
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
         portfolio_url = v_portfolio
   where id = v_caller;

  perform public._apply_intake_fields(
    v_caller, p_preferred_name, p_bio_focus, p_bio_hobbies, p_current_focus,
    p_venture_stage, p_venture_name, p_venture_url, p_venture_one_liner,
    p_recruiting_status, p_intent_urgency, p_availability_hours,
    p_skill_ids, p_core_skill_ids, p_sector_ids,
    p_academic_interests, p_hobbies, p_intents
  );
end;
$$;

revoke execute on function public.update_profile(
  text, text, text, int, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, smallint[], smallint[], smallint[],
  text[], text[], text[]
) from public, anon;
grant execute on function public.update_profile(
  text, text, text, int, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, smallint[], smallint[], smallint[],
  text[], text[], text[]
) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Gate update_profile on approved status
--
-- submit_intake already refuses to run unless the caller's status is
-- 'approved' (20260901000006, line ~194: "Your membership must be approved
-- before you can complete your profile"). update_profile — called directly
-- from the browser by ProfileForm, bypassing any server action — never
-- gained the same check: profiles_update_own RLS only verifies
-- `id = auth.uid()`, with no status condition.
--
-- Concretely: a member whose status flips to 'rejected' mid-session (an
-- admin action, or a re-review) can keep successfully saving profile edits
-- from an already-open /profile tab until they navigate away or reload —
-- the RPC has no way to know the account has been rejected. Every other
-- post-approval write path (submit_intake, defer_intake, the avatar/CV
-- upload actions via guardApprovedMember) already re-checks status
-- server-side; this closes the one gap.
--
-- Body is 20260901000006's update_profile verbatim, signature unchanged
-- (so CREATE OR REPLACE is enough — no DROP needed), with `status` added
-- to the initial SELECT and one new guard raised right after it.
-- ════════════════════════════════════════════════════════════════════

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
  v_status       user_status;
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

  select role, status into v_role, v_status from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if v_status <> 'approved' then
    raise exception 'Your membership must be approved before you can edit your profile'
      using errcode = '42501';
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

-- Grants are unchanged from 20260901000006 (same signature) — restated here
-- only because CREATE OR REPLACE does not touch existing grants, so this is
-- a no-op confirmation, not a behaviour change.
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

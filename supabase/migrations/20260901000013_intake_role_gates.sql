-- ════════════════════════════════════════════════════════════════════
-- Foundry · Role-based CV/LinkedIn requirements, and gating "Skip for now"
--
-- Three changes, landing together because they're one logical change:
--
--   1. CV was required for EVERY role (20260901000010) — too broad. Now
--      required only for role = 'student'; every other role keeps the
--      "optional, upload if you have one" behaviour.
--
--   2. LinkedIn was never required at intake time at all (only at
--      /onboarding, and only for non-students). Now required for
--      EVERYONE at intake — a student is never asked for it anywhere
--      else, and this is the one place to fix that.
--
--   3. defer_intake ("Skip for now") was a full bypass, unconditionally.
--      That was fine while nothing was compulsory; it isn't now — a
--      member could hit Skip before ever providing the CV/LinkedIn that
--      are now required. defer_intake gets the same role-aware check
--      submit_intake gets, reading straight off the profile row so it
--      cannot be bypassed by a client that fails to hide the button.
--
-- LinkedIn is persisted the moment it's entered (via the new
-- set_my_linkedin below), the same way confirm_cv_upload already
-- persists cv_path immediately rather than waiting for submit_intake —
-- so "already saved" is a real, server-checkable fact the instant the
-- member leaves the CV screen, not something only true after Finish.
-- set_my_linkedin is a dedicated setter rather than reusing
-- update_profile: update_profile overwrites first_name/surname/course/
-- grad_year/github/portfolio unconditionally from its arguments (no
-- COALESCE against the existing row), so calling it with only a
-- LinkedIn value would either fail those NOT NULL checks or silently
-- blank fields the intake flow never loaded in the first place. A
-- single-column setter avoids that blast radius entirely — same
-- precedent as confirm_avatar_upload/confirm_cv_upload.
-- ════════════════════════════════════════════════════════════════════

-- ─── set_my_linkedin ─────────────────────────────────────────────────
create or replace function public.set_my_linkedin(p_linkedin_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_linkedin text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_linkedin := nullif(trim(coalesce(p_linkedin_url, '')), '');

  if v_linkedin is not null then
    if length(v_linkedin) > 512 then
      raise exception 'LinkedIn URL is too long' using errcode = '22023';
    end if;
    if v_linkedin !~* '^https?://([a-z0-9-]+\.)*linkedin\.com/' then
      raise exception 'That does not look like a LinkedIn URL' using errcode = '22023';
    end if;
  end if;

  update public.profiles set linkedin_url = v_linkedin where id = v_caller;
end;
$$;

revoke execute on function public.set_my_linkedin(text) from public, anon;
grant  execute on function public.set_my_linkedin(text) to authenticated;

-- ─── submit_intake: CV required for students only, LinkedIn for all ──
-- Same signature as 20260901000006/20260901000010 — CREATE OR REPLACE
-- is safe, no drop needed.
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
  v_caller   uuid := auth.uid();
  v_status   user_status;
  v_version  smallint;
  v_role     user_role;
  v_cv_path  text;
  v_linkedin text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select status, profile_version, role, cv_path, linkedin_url
    into v_status, v_version, v_role, v_cv_path, v_linkedin
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
  if v_role = 'student' and v_cv_path is null then
    raise exception 'Add your CV before finishing your profile' using errcode = '23514';
  end if;
  if v_linkedin is null then
    raise exception 'Add your LinkedIn profile before finishing your profile' using errcode = '23514';
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

-- ─── defer_intake: same role-aware gate, the real enforcement for
-- "Skip for now" — the client hides the button, this is what actually
-- stops the bypass. Preserves the original silent no-op for a caller
-- whose row doesn't match status = 'approved' (e.g. an admin previewing
-- the flow on a non-approved profile) rather than raising for them.
create or replace function public.defer_intake()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller   uuid := auth.uid();
  v_role     user_role;
  v_cv_path  text;
  v_linkedin text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role, cv_path, linkedin_url into v_role, v_cv_path, v_linkedin
    from public.profiles
   where id = v_caller
     and status = 'approved';
  if not found then
    return;
  end if;

  if v_role = 'student' and v_cv_path is null then
    raise exception 'Add your CV before you can skip the rest' using errcode = '23514';
  end if;
  if v_linkedin is null then
    raise exception 'Add your LinkedIn profile before you can skip the rest' using errcode = '23514';
  end if;

  update public.profiles
     set intake_deferred_at = now()
   where id = v_caller;
end;
$$;

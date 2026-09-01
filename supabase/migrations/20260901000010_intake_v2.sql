-- ════════════════════════════════════════════════════════════════════
-- Foundry · Intake v2 — CV required, and a wider "what you want" list
--
-- Two independent changes, bundled because both are one-line edits to
-- functions/constraints already introduced this batch:
--
--   1. A CV is no longer optional once a member is going through the
--      intake — it is what will drive candidate matching for recruiters,
--      and a matcher with half its inputs missing isn't one. Enforced
--      here as defense-in-depth behind the frontend's own check
--      (IntakeFlow.tsx's validate()), against a direct RPC call. The
--      flow-level "Skip for now" (defer_intake) is UNCHANGED — a member
--      can still defer the whole intake and finish another day; this
--      only means the CV screen itself can't be passed without a file
--      once someone is going through the flow.
--
--   2. profile_intents_intent_check was a closed list of concrete
--      professional asks, with nothing for a member who joined mostly
--      out of curiosity. Widened rather than replaced — the original
--      seven stay exactly as they were.
-- ════════════════════════════════════════════════════════════════════

-- ─── Wider intents ───────────────────────────────────────────────────
alter table public.profile_intents drop constraint if exists profile_intents_intent_check;
alter table public.profile_intents add constraint profile_intents_intent_check check (intent in (
  'find_cofounder', 'first_hire', 'investor_intros', 'find_mentor',
  'technical_help', 'customers', 'somewhere_to_start',
  'just_curious', 'taste_of_community', 'meet_people'
));

-- ─── CV required to complete the intake ─────────────────────────────
-- Same signature as 20260901000006 — CREATE OR REPLACE is safe here,
-- no drop needed (recreate-function-from-latest only bites on a
-- parameter/return-type change).
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
  v_cv_path text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select status, profile_version, cv_path into v_status, v_version, v_cv_path
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
  if v_cv_path is null then
    raise exception 'Add your CV before finishing your profile' using errcode = '23514';
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

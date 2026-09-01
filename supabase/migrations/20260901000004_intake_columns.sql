-- ════════════════════════════════════════════════════════════════════
-- Foundry · Post-approval intake columns (venture / intent / status)
--
-- These back screens 06-07 of the rebuilt intake ("Where you're at",
-- "What you want") — the fields the prototype groups as "later,
-- prompted" because they change more often than identity does.
--
-- intake_deferred_at is what makes the whole flow skippable without a
-- redirect loop: /home bounces an approved member to /intake only when
-- profile_version < 2 AND intake_deferred_at IS NULL. One column, no
-- session state, and the backfill below means an existing member never
-- meets a wall on their next login — only the dismissible prompt card.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists current_focus       text,
  add column if not exists venture_stage        text,
  add column if not exists venture_name         text,
  add column if not exists venture_url          text,
  add column if not exists venture_one_liner    text,
  add column if not exists recruiting_status    text,
  add column if not exists intent_urgency       text,
  add column if not exists availability_hours   text,
  add column if not exists intake_completed_at  timestamptz,
  add column if not exists intake_deferred_at   timestamptz;

alter table public.profiles
  drop constraint if exists profiles_current_focus_check,
  drop constraint if exists profiles_venture_stage_check,
  drop constraint if exists profiles_venture_name_len,
  drop constraint if exists profiles_venture_url_format,
  drop constraint if exists profiles_venture_url_len,
  drop constraint if exists profiles_venture_one_liner_len,
  drop constraint if exists profiles_recruiting_status_check,
  drop constraint if exists profiles_intent_urgency_check,
  drop constraint if exists profiles_availability_hours_check;

alter table public.profiles
  add constraint profiles_current_focus_check check (current_focus in (
    'studying', 'studying_building', 'building_full_time', 'employed',
    'employed_building', 'research_phd', 'paused_studies_to_build',
    'job_hunting', 'between_things'
  )),
  add constraint profiles_venture_stage_check check (venture_stage in (
    'nothing_yet', 'exploring_ideas', 'validating', 'building_mvp',
    'launched_early_users', 'generating_revenue', 'raised_funding',
    'founded_before_between', 'not_building_want_to_join'
  )),
  add constraint profiles_venture_name_len check (
    venture_name is null or length(venture_name) between 1 and 200),
  add constraint profiles_venture_url_format check (
    venture_url is null or venture_url ~* '^https?://'),
  add constraint profiles_venture_url_len check (
    venture_url is null or length(venture_url) <= 512),
  add constraint profiles_venture_one_liner_len check (
    venture_one_liner is null or length(venture_one_liner) <= 140),
  add constraint profiles_recruiting_status_check check (recruiting_status in (
    'not_right_now', 'co_founder', 'first_hires', 'interns', 'advisors'
  )),
  add constraint profiles_intent_urgency_check check (intent_urgency in (
    'actively_looking', 'next_few_months', 'open_not_urgent'
  )),
  add constraint profiles_availability_hours_check check (availability_hours in (
    'under_5', '5_10', '10_20', '20_plus', 'full_time'
  ));

-- ─── Backfill: every existing approved member gets the deferred prompt,
--     never a wall ─────────────────────────────────────────────────
-- Anyone approved before this migration has never seen /intake and has
-- no way to have completed it. Without this, the first thing each of
-- them meets on next login is a redirect wall. profile_version stays at
-- 1 for these rows (set by 20260828000003) — only intake_deferred_at
-- changes, and only where it is not already set, so this is safe to
-- re-run.
update public.profiles
   set intake_deferred_at = now()
 where status = 'approved'
   and intake_deferred_at is null;

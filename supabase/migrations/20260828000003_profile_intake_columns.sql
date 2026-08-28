-- ════════════════════════════════════════════════════════════════════
-- Foundry · Profile columns for the rebuilt intake
--
-- The nine-screen intake asks for four things the table cannot hold, and
-- needs a way to tell an existing member from a new one.
--
--   preferred_name  what we address them as. first_name is their legal
--                   first name and is not always what they answer to.
--   bio_focus       what they are working on or into  (was: working_on)
--   bio_hobbies     what they do outside it            (new)
--   avatar_path     blob path, written by the FastAPI upload service
--   profile_version 1 = joined under the old four-step form
--                   2 = completed the nine-screen intake
--
-- WHY TWO BIO COLUMNS. The old form had one `bio` plus `working_on` and
-- no rule about which held what — 12 of 28 rows have bio, 11 have
-- working_on, and they overlap. Splitting them by intent lets the two be
-- weighted differently in matching: the first drives who you are matched
-- with, the second decides whether the meeting actually happens. Parsing
-- one blob of prose to recover that distinction is strictly worse.
--
-- `bio` and `working_on` are LEFT IN PLACE. Dropping them would break
-- submit_onboarding, update_profile, list_directory_cards and the admin
-- queues in the same breath. They are superseded, not removed; a later
-- migration can drop them once nothing reads them.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists preferred_name  text,
  add column if not exists bio_focus       text,
  add column if not exists bio_hobbies     text,
  add column if not exists avatar_path     text,
  add column if not exists profile_version smallint not null default 1;

-- Lengths follow the existing conventions on this table.
alter table public.profiles
  drop constraint if exists profiles_preferred_name_len,
  drop constraint if exists profiles_bio_focus_len,
  drop constraint if exists profiles_bio_hobbies_len,
  drop constraint if exists profiles_avatar_path_len;

alter table public.profiles
  add constraint profiles_preferred_name_len check (
    preferred_name is null or length(preferred_name) between 1 and 50),
  add constraint profiles_bio_focus_len check (
    bio_focus is null or length(bio_focus) between 1 and 500),
  add constraint profiles_bio_hobbies_len check (
    bio_hobbies is null or length(bio_hobbies) between 1 and 500),
  add constraint profiles_avatar_path_len check (
    avatar_path is null or length(avatar_path) <= 400);

-- ─── Backfill ────────────────────────────────────────────────────────
-- working_on is the closer match to bio_focus; bio is the fallback. Only
-- fills nulls, so re-running is safe and no existing text is lost. bio is
-- capped at 1000 on the old column and 500 on the new one, so the
-- fallback is truncated rather than rejected.
update public.profiles
   set bio_focus = left(coalesce(nullif(trim(working_on), ''), nullif(trim(bio), '')), 500)
 where bio_focus is null
   and coalesce(nullif(trim(working_on), ''), nullif(trim(bio), '')) is not null;

-- Everyone already in the table joined under the old form. Explicit rather
-- than relying on the column default, so the intent survives a re-run.
update public.profiles set profile_version = 1 where profile_version is null;

-- ─── avatar_path is not user-writable ────────────────────────────────
-- profiles_update_own lets a member UPDATE any column on their own row.
-- An unguarded avatar_path would let one member point their card at
-- another member's photo — impersonation in a directory whose entire
-- value is that identities are checked. role and status are locked for
-- the same reason (20260531000003, 20260603000001); this mirrors them.
--
-- The FastAPI upload service holds the service-role key, so it writes
-- this column without tripping the trigger.
create or replace function public.tg_profiles_protect_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path then
    if auth.role() = 'service_role' or public.is_admin() then
      return new;
    end if;
    raise exception 'avatar_path is set by the upload service, not directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_avatar_path on public.profiles;
create trigger profiles_protect_avatar_path
  before update on public.profiles
  for each row execute function public.tg_profiles_protect_avatar_path();

-- `revoke ... from public` alone does NOT lock this down: Supabase grants
-- EXECUTE to anon and authenticated through default privileges, so both
-- roles have to be named explicitly. This is the rule 20260608000001
-- exists to enforce, and rls_smoke.sql fails the build without it.
revoke execute on function public.tg_profiles_protect_avatar_path()
  from public, anon, authenticated;

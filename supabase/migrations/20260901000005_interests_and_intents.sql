-- ════════════════════════════════════════════════════════════════════
-- Foundry · Free-text interests/hobbies, and ranked intents
--
-- Two new tables, both written only by submit_intake (20260901000006)
-- and update_profile.
--
-- profile_interests holds ACADEMIC INTERESTS and HOBBIES only —
-- deliberately not sectors. Sectors already have a closed lookup
-- (public.sectors + profile_sectors) and stay there; giving them a
-- second, parallel free-text home here would be two ways to say the
-- same thing. Academic interests and hobbies are never filtered on
-- (only displayed, and later embedded for the CV matcher), so free
-- text costs nothing — a closed hobby list would be absurd.
--
-- profile_intents is ranked and capped at 3 on purpose: uncapped, the
-- median member picks seven and the field carries no matching signal.
-- Values mirror lib/intake/state.ts's WANTS array (frontend, wired in
-- a later step) so the UI and the schema agree on vocabulary.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.profile_interests (
  id         uuid        primary key default gen_random_uuid(),
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  kind       text        not null check (kind in ('academic', 'hobby')),
  label      text        not null,
  created_at timestamptz not null default now(),

  constraint profile_interests_label_len check (length(label) between 1 and 100)
);

create index if not exists profile_interests_profile_idx
  on public.profile_interests (profile_id);

alter table public.profile_interests enable row level security;

create policy profile_interests_select_own
  on public.profile_interests for select
  using (profile_id = auth.uid());

create policy profile_interests_select_admin
  on public.profile_interests for select
  using (public.is_admin());

-- No direct INSERT/UPDATE/DELETE policies. Written only via
-- submit_intake and update_profile, both SECURITY DEFINER, which is
-- what lets the 12-per-kind cap below be enforced in one place rather
-- than trusted to every future caller.

-- ─── Cap: at most 12 entries per (profile, kind) ────────────────────
-- A CHECK constraint cannot see other rows, so this needs a trigger —
-- same shape as profile_skills_cap_core (20260901000001).
create or replace function public.tg_profile_interests_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.profile_interests
   where profile_id = new.profile_id
     and kind = new.kind;
  if v_count >= 12 then
    raise exception 'You can add up to 12 entries in this section.'
      using errcode = '23514', constraint = 'profile_interests_per_profile_cap';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_interests_cap on public.profile_interests;
create trigger profile_interests_cap
  before insert on public.profile_interests
  for each row execute function public.tg_profile_interests_cap();

revoke execute on function public.tg_profile_interests_cap()
  from public, anon, authenticated;

-- ─── profile_intents ─────────────────────────────────────────────────
create table if not exists public.profile_intents (
  profile_id uuid     not null references public.profiles(id) on delete cascade,
  intent     text     not null,
  rank       smallint not null,

  primary key (profile_id, rank),

  constraint profile_intents_intent_check check (intent in (
    'find_cofounder', 'first_hire', 'investor_intros', 'find_mentor',
    'technical_help', 'customers', 'somewhere_to_start'
  )),
  constraint profile_intents_rank_range check (rank between 1 and 3),
  -- One profile cannot rank the same intent twice under different ranks —
  -- that would silently drop one of the two on the ranked-picker UI.
  constraint profile_intents_unique_intent unique (profile_id, intent)
);

create index if not exists profile_intents_profile_idx
  on public.profile_intents (profile_id);

alter table public.profile_intents enable row level security;

create policy profile_intents_select_own
  on public.profile_intents for select
  using (profile_id = auth.uid());

create policy profile_intents_select_admin
  on public.profile_intents for select
  using (public.is_admin());

-- No direct write policies, same reasoning as profile_interests — written
-- only via submit_intake and update_profile.


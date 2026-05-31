-- ════════════════════════════════════════════════════════════════════
-- Foundry · Initial schema
--
-- Tables, types, indexes, triggers, helper functions.
-- RLS is enabled here but policies live in 20260527000002_rls_policies.sql.
-- Admin operation functions live in 20260527000003_admin_functions.sql.
-- ════════════════════════════════════════════════════════════════════

-- ─── Extensions ──────────────────────────────────────────────────────
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ─── Enums ───────────────────────────────────────────────────────────
create type public.user_role     as enum ('student', 'alum');
create type public.user_status   as enum ('pending_onboarding', 'pending_review', 'approved', 'rejected');
create type public.listing_status as enum ('pending', 'approved', 'rejected');
create type public.location_type as enum ('remote', 'hybrid', 'onsite');
create type public.vc_grant_kind as enum ('vc', 'grant');

-- ─── Lookup: skills + sectors ────────────────────────────────────────
create table public.skills (
  id         smallserial primary key,
  name       citext      not null unique,
  created_at timestamptz not null default now()
);

create table public.sectors (
  id         smallserial primary key,
  name       citext      not null unique,
  created_at timestamptz not null default now()
);

-- ─── Profiles (extends auth.users) ───────────────────────────────────
create table public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  role         user_role   not null,
  status       user_status not null default 'pending_onboarding',
  first_name   text        not null default '',
  surname      text        not null default '',
  linkedin_url text,
  grad_year    int,
  bio          text,
  working_on   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_grad_year_role_consistency check (
    (role = 'alum'    and grad_year is not null) or
    (role = 'student' and grad_year is null)
  ),
  constraint profiles_grad_year_range check (
    grad_year is null or grad_year between 1950 and 2099
  ),
  constraint profiles_linkedin_url_format check (
    linkedin_url is null
    or linkedin_url ~* '^https?://([a-z0-9-]+\.)*linkedin\.com/'
  ),
  constraint profiles_first_name_len check (length(first_name) <= 100),
  constraint profiles_surname_len    check (length(surname)    <= 100),
  constraint profiles_bio_len        check (bio is null or length(bio) between 1 and 1000),
  constraint profiles_working_on_len check (working_on is null or length(working_on) <= 500)
);

create index profiles_status_idx on public.profiles (status);
create index profiles_role_idx   on public.profiles (role);

-- ─── User interests (junction) ───────────────────────────────────────
create table public.profile_skills (
  profile_id uuid     not null references public.profiles(id) on delete cascade,
  skill_id   smallint not null references public.skills(id)   on delete restrict,
  primary key (profile_id, skill_id)
);

create table public.profile_sectors (
  profile_id uuid     not null references public.profiles(id) on delete cascade,
  sector_id  smallint not null references public.sectors(id)  on delete restrict,
  primary key (profile_id, sector_id)
);

create index profile_skills_skill_idx   on public.profile_skills  (skill_id);
create index profile_sectors_sector_idx on public.profile_sectors (sector_id);

-- ─── Opportunities ───────────────────────────────────────────────────
create table public.opportunities (
  id              uuid           primary key default gen_random_uuid(),
  posted_by       uuid           not null references public.profiles(id) on delete restrict,
  status          listing_status not null default 'pending',
  position_name   text           not null,
  company         text           not null,
  pay             text           not null,
  location_type   location_type  not null,
  location_text   text,
  description     text           not null,
  start_month     smallint       not null,
  start_year      int            not null,
  rejected_reason text,
  approved_at     timestamptz,
  approved_by     uuid           references auth.users(id) on delete set null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),

  constraint opportunities_position_name_len check (length(position_name) between 2 and 200),
  constraint opportunities_company_len       check (length(company)       between 1 and 200),
  constraint opportunities_pay_len           check (length(pay)           between 1 and 100),
  constraint opportunities_location_text_len check (location_text is null or length(location_text) between 1 and 200),
  constraint opportunities_description_len   check (length(description)   between 20 and 5000),
  constraint opportunities_start_month_range check (start_month between 1 and 12),
  constraint opportunities_start_year_range  check (start_year  between 2020 and 2099),
  constraint opportunities_rejected_reason_consistency check (
    (status = 'rejected' and rejected_reason is not null) or
    (status != 'rejected' and rejected_reason is null)
  ),
  constraint opportunities_approval_metadata check (
    (status in ('approved', 'rejected') and approved_at is not null and approved_by is not null) or
    (status = 'pending' and approved_at is null and approved_by is null)
  )
);

create index opportunities_status_idx     on public.opportunities (status);
create index opportunities_posted_by_idx  on public.opportunities (posted_by);
create index opportunities_created_at_idx on public.opportunities (created_at desc);

create table public.opportunity_skills (
  opportunity_id uuid     not null references public.opportunities(id) on delete cascade,
  skill_id       smallint not null references public.skills(id)         on delete restrict,
  primary key (opportunity_id, skill_id)
);

create table public.opportunity_sectors (
  opportunity_id uuid     not null references public.opportunities(id) on delete cascade,
  sector_id      smallint not null references public.sectors(id)        on delete restrict,
  primary key (opportunity_id, sector_id)
);

create index opportunity_skills_skill_idx   on public.opportunity_skills  (skill_id);
create index opportunity_sectors_sector_idx on public.opportunity_sectors (sector_id);

-- ─── VCs and grants ──────────────────────────────────────────────────
create table public.vcs_grants (
  id              uuid           primary key default gen_random_uuid(),
  kind            vc_grant_kind  not null,
  posted_by       uuid           not null references public.profiles(id) on delete restrict,
  status          listing_status not null default 'pending',
  name            text           not null,
  description     text           not null,
  link            text           not null,
  amount          text,
  deadline        date,
  stage           text,
  rejected_reason text,
  approved_at     timestamptz,
  approved_by     uuid           references auth.users(id) on delete set null,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),

  constraint vcs_grants_name_len        check (length(name)        between 2 and 200),
  constraint vcs_grants_description_len check (length(description) between 20 and 5000),
  constraint vcs_grants_link_format     check (link ~* '^https?://'),
  constraint vcs_grants_amount_len      check (amount is null or length(amount) between 1 and 100),
  constraint vcs_grants_stage_len       check (stage  is null or length(stage)  between 1 and 100),
  constraint vcs_grants_rejected_reason_consistency check (
    (status = 'rejected' and rejected_reason is not null) or
    (status != 'rejected' and rejected_reason is null)
  ),
  constraint vcs_grants_approval_metadata check (
    (status in ('approved', 'rejected') and approved_at is not null and approved_by is not null) or
    (status = 'pending' and approved_at is null and approved_by is null)
  )
);

create index vcs_grants_kind_status_idx on public.vcs_grants (kind, status);
create index vcs_grants_posted_by_idx   on public.vcs_grants (posted_by);

-- ─── Admin (single-row design) ───────────────────────────────────────
create table public.admins (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ─── Admin audit log ─────────────────────────────────────────────────
create table public.admin_actions (
  id           uuid        primary key default gen_random_uuid(),
  admin_id     uuid        not null references auth.users(id) on delete restrict,
  action       text        not null,
  target_table text        not null,
  target_id    uuid        not null,
  notes        text,
  created_at   timestamptz not null default now()
);

create index admin_actions_admin_idx      on public.admin_actions (admin_id);
create index admin_actions_target_idx     on public.admin_actions (target_table, target_id);
create index admin_actions_created_at_idx on public.admin_actions (created_at desc);

-- ─── Helper: is current user admin? ──────────────────────────────────
-- SECURITY DEFINER so callers don't need read access to public.admins.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ─── Helper: is current user approved (i.e., onboarded + reviewed)? ──
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- ─── Trigger: set updated_at ─────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at      before update on public.profiles      for each row execute function public.tg_set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities for each row execute function public.tg_set_updated_at();
create trigger vcs_grants_set_updated_at    before update on public.vcs_grants    for each row execute function public.tg_set_updated_at();

-- ─── Trigger: protect profile status from non-admin writes ───────────
-- The service_role bypasses RLS but NOT triggers, so this is enforced
-- regardless of how the row is updated.
create or replace function public.tg_profiles_protect_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    raise exception 'Only admins can change profile status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_status
  before update on public.profiles
  for each row execute function public.tg_profiles_protect_status();

-- ─── Trigger: protect listing status from non-admin writes ───────────
create or replace function public.tg_listings_protect_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    raise exception 'Only admins can change listing status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger opportunities_protect_status
  before update on public.opportunities
  for each row execute function public.tg_listings_protect_status();

create trigger vcs_grants_protect_status
  before update on public.vcs_grants
  for each row execute function public.tg_listings_protect_status();

-- ─── Trigger: auto-create profile when an auth.users row appears ─────
-- Reads role / names / grad_year from signup metadata. Defaults to
-- 'student' for OAuth signups that won't pass role metadata.
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role       user_role;
  v_first_name text;
  v_surname    text;
  v_grad_year  int;
begin
  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role', '')::user_role,
    'student'
  );

  v_first_name := coalesce(
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'given_name',
    ''
  );

  v_surname := coalesce(
    new.raw_user_meta_data->>'surname',
    new.raw_user_meta_data->>'family_name',
    ''
  );

  v_grad_year := nullif(new.raw_user_meta_data->>'grad_year', '')::int;

  insert into public.profiles (id, role, first_name, surname, grad_year)
  values (new.id, v_role, v_first_name, v_surname, v_grad_year);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- ─── Enable RLS on every table (policies in next migration) ──────────
alter table public.profiles            enable row level security;
alter table public.skills              enable row level security;
alter table public.sectors             enable row level security;
alter table public.profile_skills      enable row level security;
alter table public.profile_sectors     enable row level security;
alter table public.opportunities       enable row level security;
alter table public.opportunity_skills  enable row level security;
alter table public.opportunity_sectors enable row level security;
alter table public.vcs_grants          enable row level security;
alter table public.admins              enable row level security;
alter table public.admin_actions       enable row level security;

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function public.is_admin()    to authenticated, anon;
grant execute on function public.is_approved() to authenticated;

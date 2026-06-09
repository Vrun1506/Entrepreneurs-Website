-- ─── Clear error when an admin without a member profile posts a listing ──
-- Hardening follow-up 2026-06-10.
--
-- admin_create_opportunity / admin_create_event / admin_create_vc_grant all
-- insert `posted_by = auth.uid()`, and the three listing tables declare
-- `posted_by NOT NULL references public.profiles(id)`. A "bootstrap" admin
-- (added straight into public.admins, who never went through signup +
-- onboarding) has no profiles row, so the insert raised a raw 23503
-- foreign_key_violation. The frontend error mapper relabels EVERY 23503 as
-- the misleading "That item no longer exists." — leaving the admin with no
-- idea what's wrong.
--
-- Fix: a pre-flight guard, right after the existing is_admin() check, that
-- raises a clear message when the caller has no profile. It is raised with
-- the DEFAULT sqlstate (P0001), which describeSupabaseError does NOT map —
-- so the readable message passes through to the user verbatim. (Using 23503
-- here would be re-swallowed by the mapper, which is the whole trap.)
--
-- Each function is recreated VERBATIM from its latest live definition
-- (admin_create_event from 20260603000002, the other two from
-- 20260528000016) with ONLY the guard added, matching the exact signatures
-- so this REPLACES the live functions rather than creating dead overloads.
-- No behaviour change for any admin who has a profile (every normally
-- onboarded admin) — the exists() check simply passes. CREATE OR REPLACE
-- preserves the existing EXECUTE grants, so no re-grant is needed.

-- ─── admin_create_opportunity (15-arg) ──────────────────────────────────
create or replace function public.admin_create_opportunity(
  p_position_name         text,
  p_company               text,
  p_pay                   text,
  p_location_type         location_type,
  p_location_text         text,
  p_description           text,
  p_start_month           smallint,
  p_start_year            int,
  p_application_deadline  date,
  p_contact_email         text,
  p_contact_email_visible boolean,
  p_apply_method          apply_method,
  p_apply_url             text,
  p_skill_ids             smallint[],
  p_sector_ids            smallint[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'Your admin account does not have a member profile yet, so it cannot be set as the poster. Please complete onboarding (or have a developer create your profile) first.';
  end if;
  if p_application_deadline is null or p_application_deadline < current_date then
    raise exception 'Application deadline must be today or later';
  end if;

  v_email := nullif(trim(coalesce(p_contact_email, '')), '');
  if v_email is null then
    select email into v_email from auth.users where id = v_caller;
  end if;

  insert into public.opportunities (
    posted_by, status,
    position_name, company, pay,
    location_type, location_text,
    description, start_month, start_year,
    application_deadline,
    contact_email, contact_email_visible,
    apply_method, apply_url,
    approved_at, approved_by
  ) values (
    v_caller, 'approved',
    p_position_name, p_company, p_pay,
    p_location_type, p_location_text,
    p_description, p_start_month, p_start_year,
    p_application_deadline,
    v_email, coalesce(p_contact_email_visible, false),
    p_apply_method, p_apply_url,
    now(), v_caller
  )
  returning id into v_new_id;

  if p_skill_ids is not null and array_length(p_skill_ids, 1) > 0 then
    insert into public.opportunity_skills (opportunity_id, skill_id)
    select v_new_id, unnest(p_skill_ids)
    on conflict do nothing;
  end if;

  if p_sector_ids is not null and array_length(p_sector_ids, 1) > 0 then
    insert into public.opportunity_sectors (opportunity_id, sector_id)
    select v_new_id, unnest(p_sector_ids)
    on conflict do nothing;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_create_opportunity', 'opportunities', v_new_id, null);

  return v_new_id;
end;
$$;

-- ─── admin_create_event (9-arg, with society flag) ──────────────────────
create or replace function public.admin_create_event(
  p_title                 text,
  p_description           text,
  p_luma_link             text,
  p_event_at              timestamptz,
  p_location              text,
  p_organiser_name        text,
  p_contact_email         text,
  p_contact_email_visible boolean,
  p_is_society_event      boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'Your admin account does not have a member profile yet, so it cannot be set as the poster. Please complete onboarding (or have a developer create your profile) first.';
  end if;
  if p_event_at is null or p_event_at < now() then
    raise exception 'Event start time must be in the future';
  end if;

  v_email := nullif(trim(coalesce(p_contact_email, '')), '');
  if v_email is null then
    select email into v_email from auth.users where id = v_caller;
  end if;

  insert into public.events (
    posted_by, status,
    title, description, luma_link,
    event_at, location, organiser_name,
    contact_email, contact_email_visible,
    is_society_event,
    approved_at, approved_by
  ) values (
    v_caller, 'approved',
    p_title, p_description, p_luma_link,
    p_event_at, p_location, p_organiser_name,
    v_email, coalesce(p_contact_email_visible, false),
    coalesce(p_is_society_event, false),
    now(), v_caller
  )
  returning id into v_new_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_create_event', 'events', v_new_id, null);

  return v_new_id;
end;
$$;

-- ─── admin_create_vc_grant (7-arg) ──────────────────────────────────────
create or replace function public.admin_create_vc_grant(
  p_kind        vc_grant_kind,
  p_name        text,
  p_description text,
  p_link        text,
  p_amount      text,
  p_deadline    date,
  p_stage       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'Your admin account does not have a member profile yet, so it cannot be set as the poster. Please complete onboarding (or have a developer create your profile) first.';
  end if;

  insert into public.vcs_grants (
    posted_by, status, kind,
    name, description, link,
    amount, deadline, stage,
    approved_at, approved_by
  ) values (
    v_caller, 'approved', p_kind,
    p_name, p_description, p_link,
    nullif(trim(coalesce(p_amount, '')), ''),
    p_deadline,
    nullif(trim(coalesce(p_stage,  '')), ''),
    now(), v_caller
  )
  returning id into v_new_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_create_vc_grant', 'vcs_grants', v_new_id, null);

  return v_new_id;
end;
$$;

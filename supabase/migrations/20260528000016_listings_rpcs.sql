-- ════════════════════════════════════════════════════════════════════
-- Foundry · Listing submission + approval RPCs
--
-- 1. Loosen tg_listings_protect_status so an approved row can flip to
--    'expired' without admin context (used by the pg_cron job; safe
--    because RLS already restricts UPDATE on approved rows to admins).
-- 2. submit_opportunity / submit_event / submit_vc_grant — atomic insert
--    helpers for approved members. status='pending'.
-- 3. approve_event / reject_event — mirror approve_opportunity et al.
-- 4. admin_create_opportunity / admin_create_event / admin_create_vc_grant
--    — admins skip the queue. status='approved' immediately.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Status-protect trigger: permit approved → expired ────────────
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
    -- Automated expiry path (pg_cron). RLS already restricts UPDATE on
    -- approved rows to admins, so this is reachable only from internal
    -- SECURITY DEFINER code running with no JWT context.
    if old.status = 'approved' and new.status = 'expired' then
      return new;
    end if;
    raise exception 'Only admins can change listing status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── 2a. submit_opportunity ──────────────────────────────────────────
create or replace function public.submit_opportunity(
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
  v_caller   uuid := auth.uid();
  v_email    text;
  v_new_id   uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_approved() then
    raise exception 'Only approved members can post opportunities' using errcode = '42501';
  end if;
  if p_application_deadline is null or p_application_deadline < current_date then
    raise exception 'Application deadline must be today or later';
  end if;

  -- Fall back to the caller's signup email when none provided.
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
    apply_method, apply_url
  ) values (
    v_caller, 'pending',
    p_position_name, p_company, p_pay,
    p_location_type, p_location_text,
    p_description, p_start_month, p_start_year,
    p_application_deadline,
    v_email, coalesce(p_contact_email_visible, false),
    p_apply_method, p_apply_url
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

  return v_new_id;
end;
$$;

-- ─── 2b. submit_event ────────────────────────────────────────────────
create or replace function public.submit_event(
  p_title                 text,
  p_description           text,
  p_luma_link             text,
  p_event_at              timestamptz,
  p_location              text,
  p_organiser_name        text,
  p_contact_email         text,
  p_contact_email_visible boolean
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
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_approved() then
    raise exception 'Only approved members can post events' using errcode = '42501';
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
    contact_email, contact_email_visible
  ) values (
    v_caller, 'pending',
    p_title, p_description, p_luma_link,
    p_event_at, p_location, p_organiser_name,
    v_email, coalesce(p_contact_email_visible, false)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ─── 2c. submit_vc_grant ─────────────────────────────────────────────
create or replace function public.submit_vc_grant(
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
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_approved() then
    raise exception 'Only approved members can submit VCs/grants' using errcode = '42501';
  end if;

  insert into public.vcs_grants (
    posted_by, status, kind,
    name, description, link,
    amount, deadline, stage
  ) values (
    v_caller, 'pending', p_kind,
    p_name, p_description, p_link,
    nullif(trim(coalesce(p_amount, '')), ''),
    p_deadline,
    nullif(trim(coalesce(p_stage,  '')), '')
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ─── 3. approve_event / reject_event ─────────────────────────────────
create or replace function public.approve_event(
  p_event_id uuid,
  p_notes    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  update public.events
     set status          = 'approved',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = null
   where id = p_event_id;

  if not found then
    raise exception 'Event not found: %', p_event_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_event', 'events', p_event_id, p_notes);
end;
$$;

create or replace function public.reject_event(
  p_event_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  update public.events
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_event_id;

  if not found then
    raise exception 'Event not found: %', p_event_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_event', 'events', p_event_id, p_reason);
end;
$$;

-- ─── 4a. admin_create_opportunity (no approval queue) ────────────────
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

-- ─── 4b. admin_create_event ──────────────────────────────────────────
create or replace function public.admin_create_event(
  p_title                 text,
  p_description           text,
  p_luma_link             text,
  p_event_at              timestamptz,
  p_location              text,
  p_organiser_name        text,
  p_contact_email         text,
  p_contact_email_visible boolean
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
    approved_at, approved_by
  ) values (
    v_caller, 'approved',
    p_title, p_description, p_luma_link,
    p_event_at, p_location, p_organiser_name,
    v_email, coalesce(p_contact_email_visible, false),
    now(), v_caller
  )
  returning id into v_new_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_create_event', 'events', v_new_id, null);

  return v_new_id;
end;
$$;

-- ─── 4c. admin_create_vc_grant ───────────────────────────────────────
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

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function public.submit_opportunity(text, text, text, location_type, text, text, smallint, int, date, text, boolean, apply_method, text, smallint[], smallint[]) to authenticated;
grant execute on function public.submit_event(text, text, text, timestamptz, text, text, text, boolean) to authenticated;
grant execute on function public.submit_vc_grant(vc_grant_kind, text, text, text, text, date, text) to authenticated;
grant execute on function public.approve_event(uuid, text) to authenticated;
grant execute on function public.reject_event(uuid, text)  to authenticated;
grant execute on function public.admin_create_opportunity(text, text, text, location_type, text, text, smallint, int, date, text, boolean, apply_method, text, smallint[], smallint[]) to authenticated;
grant execute on function public.admin_create_event(text, text, text, timestamptz, text, text, text, boolean) to authenticated;
grant execute on function public.admin_create_vc_grant(vc_grant_kind, text, text, text, text, date, text) to authenticated;

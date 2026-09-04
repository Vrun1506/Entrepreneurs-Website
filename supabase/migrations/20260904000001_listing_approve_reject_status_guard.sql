-- ════════════════════════════════════════════════════════════════════
-- Foundry · Status guard for listing approve/reject RPCs
--
-- 20260902000003 closed this exact gap for approve_user (reject_user was
-- already guarded, since 20260531000001). The same race was never closed
-- for the three listing types: approve_opportunity, reject_opportunity,
-- approve_event, reject_event, approve_vc_grant, reject_vc_grant all flip
-- `status` unconditionally on `where id = p_id` + a bare `if not found`,
-- with no check that the row is still 'pending'.
--
-- Concretely: two admins (or one admin double-clicking past the
-- client-side `disabled={pending}`, which only protects a single tab)
-- acting on the same listing can double-approve (two admin_actions rows
-- for one action), double-reject (the poster gets two identical rejection
-- emails — reject_* returns the poster's email specifically so the
-- caller can send one), or race across actions (admin A approves,
-- publishing it; admin B's stale tab still shows it pending and clicks
-- reject — reject succeeds unconditionally, silently un-publishing an
-- already-approved listing and emailing a rejection notice for something
-- that had already gone live). The bulk approve/reject path
-- (lib/admin/bulk.ts) inherits the same gap on an overlapping selection.
--
-- Each body is its current definition verbatim (approve_* from
-- 20260527000003, reject_* from 20260529000006 — the returning-poster
-- rewrite), signatures unchanged, with status captured before the UPDATE
-- and the same guard shape approve_user/reject_user already use. Only
-- 'pending' may transition; this also blocks acting on an already-expired
-- listing (listing_status gained 'expired' in 20260528000013).
-- ════════════════════════════════════════════════════════════════════

-- ─── approve_opportunity ─────────────────────────────────────────────
create or replace function public.approve_opportunity(
  p_opportunity_id uuid,
  p_notes          text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.listing_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  select status into v_status from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Opportunity not found: %', p_opportunity_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'Opportunity is not pending review (status=%)', v_status;
  end if;

  update public.opportunities
     set status          = 'approved',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = null
   where id = p_opportunity_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_opportunity', 'opportunities', p_opportunity_id, p_notes);
end;
$$;

-- ─── reject_opportunity ──────────────────────────────────────────────
create or replace function public.reject_opportunity(
  p_opportunity_id uuid,
  p_reason         text
)
returns table(email text, first_name text, title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.listing_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  select status into v_status from public.opportunities where id = p_opportunity_id;
  if not found then
    raise exception 'Opportunity not found: %', p_opportunity_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'Opportunity is not pending review (status=%)', v_status;
  end if;

  update public.opportunities
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_opportunity_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_opportunity', 'opportunities', p_opportunity_id, p_reason);

  return query
    select au.email::text, p.first_name, o.position_name as title
      from public.opportunities o
      join public.profiles p on p.id = o.posted_by
      join auth.users au     on au.id = o.posted_by
     where o.id = p_opportunity_id;
end;
$$;

-- ─── approve_event ───────────────────────────────────────────────────
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
  v_status public.listing_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  select status into v_status from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found: %', p_event_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'Event is not pending review (status=%)', v_status;
  end if;

  update public.events
     set status          = 'approved',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = null
   where id = p_event_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_event', 'events', p_event_id, p_notes);
end;
$$;

-- ─── reject_event ────────────────────────────────────────────────────
create or replace function public.reject_event(
  p_event_id uuid,
  p_reason   text
)
returns table(email text, first_name text, title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.listing_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  select status into v_status from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found: %', p_event_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'Event is not pending review (status=%)', v_status;
  end if;

  update public.events
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_event_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_event', 'events', p_event_id, p_reason);

  return query
    select au.email::text, p.first_name, e.title
      from public.events e
      join public.profiles p on p.id = e.posted_by
      join auth.users au     on au.id = e.posted_by
     where e.id = p_event_id;
end;
$$;

-- ─── approve_vc_grant ────────────────────────────────────────────────
create or replace function public.approve_vc_grant(
  p_id    uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.listing_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  select status into v_status from public.vcs_grants where id = p_id;
  if not found then
    raise exception 'VC/grant not found: %', p_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'VC/grant is not pending review (status=%)', v_status;
  end if;

  update public.vcs_grants
     set status          = 'approved',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = null
   where id = p_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_vc_grant', 'vcs_grants', p_id, p_notes);
end;
$$;

-- ─── reject_vc_grant ─────────────────────────────────────────────────
create or replace function public.reject_vc_grant(
  p_id     uuid,
  p_reason text
)
returns table(email text, first_name text, title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.listing_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  select status into v_status from public.vcs_grants where id = p_id;
  if not found then
    raise exception 'VC/grant not found: %', p_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'VC/grant is not pending review (status=%)', v_status;
  end if;

  update public.vcs_grants
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_vc_grant', 'vcs_grants', p_id, p_reason);

  return query
    select au.email::text, p.first_name, v.name as title
      from public.vcs_grants v
      join public.profiles p on p.id = v.posted_by
      join auth.users au     on au.id = v.posted_by
     where v.id = p_id;
end;
$$;

-- Grants unchanged from prior definitions (same signatures throughout) —
-- restated only as a no-op confirmation, since CREATE OR REPLACE does not
-- touch existing grants.
grant execute on function public.approve_opportunity(uuid, text) to authenticated;
grant execute on function public.reject_opportunity(uuid, text)  to authenticated;
grant execute on function public.approve_event(uuid, text)       to authenticated;
grant execute on function public.reject_event(uuid, text)        to authenticated;
grant execute on function public.approve_vc_grant(uuid, text)    to authenticated;
grant execute on function public.reject_vc_grant(uuid, text)     to authenticated;

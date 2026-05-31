-- ════════════════════════════════════════════════════════════════════
-- Foundry · Daily expiry for events and VCs/grants
--
-- Mirrors the opportunities pattern (migration 17). An event is "past"
-- once its `event_at` timestamp has elapsed; a VC/grant is "past" once
-- its `deadline` date has passed. Rolling-application VCs (deadline is
-- null) are never expired.
--
-- Two new pg_cron jobs, staggered five minutes apart so the daily expiry
-- pass is sequential rather than simultaneous (no functional difference,
-- just easier to read in the logs).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Allow 'expired' on vcs_grants ────────────────────────────────
-- The initial schema's approval_metadata CHECK predates the 'expired'
-- status. Events already allow it (defined later, in migration 15).
-- Opportunities were updated in migration 14. VCs/grants were missed.
alter table public.vcs_grants
  drop constraint vcs_grants_approval_metadata;

alter table public.vcs_grants
  add constraint vcs_grants_approval_metadata check (
    (status in ('approved', 'rejected', 'expired') and approved_at is not null and approved_by is not null)
    or (status = 'pending' and approved_at is null and approved_by is null)
  );

-- ─── 2. Indexes to keep the daily scans cheap ────────────────────────
create index if not exists events_status_event_at_idx
  on public.events (status, event_at)
  where status = 'approved';

create index if not exists vcs_grants_status_deadline_idx
  on public.vcs_grants (status, deadline)
  where status = 'approved';

-- ─── 3. expire_events ────────────────────────────────────────────────
-- SECURITY DEFINER so the daily run has the privileges to flip status;
-- tg_listings_protect_status already permits approved → expired without
-- requiring an admin context (migration 16).
create or replace function public.expire_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.events
       set status = 'expired'
     where status = 'approved'
       and event_at < now()
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- ─── 4. expire_vcs_grants ────────────────────────────────────────────
-- Only flips rows with a non-null deadline. VCs with rolling applications
-- (deadline is null) are intentionally never auto-expired.
create or replace function public.expire_vcs_grants()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.vcs_grants
       set status = 'expired'
     where status = 'approved'
       and deadline is not null
       and deadline < current_date
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- ─── 5. Schedule the cron jobs ───────────────────────────────────────
-- Staggered 5 minutes apart from each other and the existing
-- opportunities job (02:00 → 02:05 → 02:10). Idempotent
-- unschedule-then-schedule so re-applying this migration doesn't pile
-- up duplicates.
do $$
begin
  perform cron.unschedule('expire-events-daily');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'expire-events-daily',
  '5 2 * * *',
  $$select public.expire_events();$$
);

do $$
begin
  perform cron.unschedule('expire-vcs-grants-daily');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'expire-vcs-grants-daily',
  '10 2 * * *',
  $$select public.expire_vcs_grants();$$
);

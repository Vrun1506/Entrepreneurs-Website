-- ════════════════════════════════════════════════════════════════════
-- Foundry · Purge rejected listings after 2 days
--
-- Rejected opportunities / events / VC-grant rows stay in the table
-- (status='rejected') so the poster can read the reviewer's reason on
-- /my-submissions. On the Supabase free tier those rows accumulate and
-- eat storage, so we reclaim them shortly after the poster has had a
-- chance to see the decision (the rejection email also carries the
-- reason). Owner chose a 2-day retention window.
--
-- The reject_* RPCs stamp approved_at = now() at review time; we fall
-- back to created_at for any legacy rejected row that predates that.
--
-- If pg_cron isn't enabled on your Supabase plan, this migration will
-- fail. Enable it in Dashboard → Database → Extensions, then re-run.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- SECURITY DEFINER so the delete runs with elevated privileges and
-- bypasses RLS (the cron job has no auth.uid()). Status-protection
-- triggers fire on UPDATE of status, not DELETE, so a straight delete
-- of a rejected row is clean.
create or replace function public.purge_rejected_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_n     integer;
begin
  with deleted as (
    delete from public.opportunities
     where status = 'rejected'
       and coalesce(approved_at, created_at) < now() - interval '2 days'
    returning 1
  )
  select count(*) into v_n from deleted;
  v_count := v_count + v_n;

  with deleted as (
    delete from public.events
     where status = 'rejected'
       and coalesce(approved_at, created_at) < now() - interval '2 days'
    returning 1
  )
  select count(*) into v_n from deleted;
  v_count := v_count + v_n;

  with deleted as (
    delete from public.vcs_grants
     where status = 'rejected'
       and coalesce(approved_at, created_at) < now() - interval '2 days'
    returning 1
  )
  select count(*) into v_n from deleted;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

-- Run daily at 02:30 UTC (after the expiry jobs at 02:00/02:05/02:10).
-- Idempotent unschedule-then-schedule so re-applying the migration
-- doesn't pile up duplicate cron rows.
do $$
begin
  perform cron.unschedule('purge-rejected-listings-daily');
exception when others then
  -- no-op if the job doesn't exist yet
  null;
end;
$$;

select cron.schedule(
  'purge-rejected-listings-daily',
  '30 2 * * *',
  $$select public.purge_rejected_listings();$$
);

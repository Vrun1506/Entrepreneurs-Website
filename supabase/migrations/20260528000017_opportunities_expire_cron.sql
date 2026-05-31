-- ════════════════════════════════════════════════════════════════════
-- Foundry · Nightly opportunity expiry
--
-- Flips approved opportunities whose application_deadline has passed
-- to status='expired' once per day.
--
-- If pg_cron isn't enabled on your Supabase plan, this migration will
-- fail. Enable it in Dashboard → Database → Extensions, then re-run.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- SECURITY DEFINER so the function runs with elevated privileges; the
-- status-protect trigger has a dedicated approved→expired bypass that
-- works without admin context.
create or replace function public.expire_opportunities()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with updated as (
    update public.opportunities
       set status = 'expired'
     where status = 'approved'
       and application_deadline < current_date
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- Run daily at 02:00 UTC. Idempotent unschedule-then-schedule so the
-- migration can be re-applied without piling up duplicate cron rows.
do $$
begin
  perform cron.unschedule('expire-opportunities-daily');
exception when others then
  -- no-op if the job doesn't exist yet
  null;
end;
$$;

select cron.schedule(
  'expire-opportunities-daily',
  '0 2 * * *',
  $$select public.expire_opportunities();$$
);

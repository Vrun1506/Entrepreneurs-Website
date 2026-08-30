-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — retention jobs and the blob-deletion drain
--
-- Four jobs. The first three are the retention policy the privacy page
-- promises, expressed as code; the fourth carries the consequences out to
-- Azure.
--
--   purge_expired_posts        hourly   posts + images past 7 days
--   purge_stale_upload_tickets hourly   abandoned uploads, and spent tickets
--   purge_moderation_records   daily    log + reports past 12 months
--   cron_drain_blob_deletions  5-minly  hands blob keys to the gateway
--
-- EVERY PURGE DELETES IN A BOUNDED BATCH. At today's volume each run
-- removes a handful of rows and the bound never engages. It is there so a
-- busy feed, or a cron that has been paused for a week, cannot produce a
-- single delete large enough to hold locks across the table or trip a
-- statement timeout. Each returns a row count, so `cron.job_run_details`
-- shows whether a run did anything.
--
-- Schedules are staggered into free slots — 02:00/02:05/02:10 are the
-- listing expiries, 02:30 is purge_rejected_listings, */5 is the email
-- drain — keeping the logs readable, which is the habit the existing
-- cron migrations set.
--
-- If pg_cron isn't enabled on your Supabase plan this migration will
-- fail. Enable it in Dashboard → Database → Extensions, then re-run.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Batch ceiling shared by the three purges. Deliberately far above any
-- plausible hour's worth of expiry, so it is a safety valve rather than
-- something the system runs into routinely.
-- (Inlined as a literal below; plpgsql has no cheap way to share a
-- constant across functions and a config table would be worse.)


-- ─── 1. Expired posts ───────────────────────────────────────────────
-- The 7-day window. Deleting the post cascades to post_images, and the
-- AFTER DELETE trigger there enqueues each blob key — so this one
-- statement destroys the row, the image rows, and schedules the bytes.
create or replace function public.purge_expired_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with doomed as (
    select id from public.posts
     where expires_at < now()
     order by expires_at
     limit 5000
  ),
  deleted as (
    delete from public.posts p
     using doomed d
     where p.id = d.id
    returning 1
  )
  select count(*) into v_count from deleted;

  return v_count;
end;
$$;

revoke execute on function public.purge_expired_posts() from public, anon, authenticated;


-- ─── 2. Stale upload tickets ────────────────────────────────────────
-- Two different rows, two different meanings.
--
-- UNCONSUMED past 24h — someone uploaded an image and never posted, or
-- closed the tab mid-compose. The bytes are in Blob with nothing
-- referencing them, so they are enqueued for deletion. This is the sweep
-- that makes an abandoned upload a cost problem rather than a data
-- problem: an orphaned image nobody can see is still personal data we
-- have no basis to keep.
--
-- CONSUMED past 24h — the ticket did its job and the blob is referenced
-- by a live post_images row. The ticket row is spent bookkeeping; drop it
-- WITHOUT enqueuing anything, or we would delete images out from under
-- posts that are still on the feed.
create or replace function public.purge_stale_upload_tickets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with abandoned as (
    select blob_key from public.upload_tickets
     where consumed_at is null
       and issued_at < now() - interval '24 hours'
     order by issued_at
     limit 5000
  ),
  queued as (
    insert into public.blob_deletion_queue (blob_key)
    select blob_key from abandoned
    returning blob_key
  ),
  deleted as (
    delete from public.upload_tickets t
     using queued q
     where t.blob_key = q.blob_key
    returning 1
  )
  select count(*) into v_count from deleted;

  delete from public.upload_tickets
   where consumed_at is not null
     and consumed_at < now() - interval '24 hours';

  return v_count;
end;
$$;

revoke execute on function public.purge_stale_upload_tickets() from public, anon, authenticated;


-- ─── 3. Moderation records ──────────────────────────────────────────
-- The 12-month window on the audit trail. `legal_hold` rows are skipped:
-- when a claim is actually live, one record can outlive the window
-- without the purge having to be disabled for everyone — which is the
-- failure mode that turns a retention policy into indefinite retention.
create or replace function public.purge_moderation_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_n     integer;
begin
  with doomed as (
    select id from public.post_moderation_log
     where purge_after < now() and legal_hold = false
     order by purge_after
     limit 5000
  ),
  deleted as (
    delete from public.post_moderation_log l
     using doomed d where l.id = d.id
    returning 1
  )
  select count(*) into v_n from deleted;
  v_count := v_count + v_n;

  with doomed as (
    select id from public.post_reports
     where purge_after < now()
     order by purge_after
     limit 5000
  ),
  deleted as (
    delete from public.post_reports r
     using doomed d where r.id = d.id
    returning 1
  )
  select count(*) into v_n from deleted;
  v_count := v_count + v_n;

  return v_count;
end;
$$;

revoke execute on function public.purge_moderation_records() from public, anon, authenticated;


-- ─── 4. Blob deletion claim ─────────────────────────────────────────
-- Same contract as claim_outbound_email_batch: atomically pick up a batch
-- and lock it for this run by pushing next_attempt_at forward, so
-- concurrent drainer invocations cooperate instead of double-deleting.
--
-- The drain route increments `attempts` only on a transient failure. A
-- key the gateway reports as already gone is a SUCCESS, not a failure —
-- see the route for why.
create or replace function public.claim_blob_deletion_batch(p_limit int default 50)
returns table (
  id           uuid,
  blob_key     text,
  attempts     int,
  max_attempts int
)
language sql
security definer
set search_path = public
as $$
  update public.blob_deletion_queue q
     set next_attempt_at = now() + interval '10 minutes'
   where q.id in (
     select id from public.blob_deletion_queue
      where deleted_at is null
        and attempts < max_attempts
        and next_attempt_at <= now()
      order by enqueued_at
      limit p_limit
      for update skip locked
   )
  returning q.id, q.blob_key, q.attempts, q.max_attempts;
$$;

revoke execute on function public.claim_blob_deletion_batch(int) from public, anon, authenticated;


-- ─── 5. pg_cron → Next.js driver ────────────────────────────────────
-- Postgres cannot talk to Azure, so the actual delete is done by the
-- Next.js route, which holds the gateway's service token. This wrapper
-- decides whether to fire at all — no HTTP when the queue is empty — and
-- no-ops with a warning if the config rows have not been seeded, so a
-- fresh database applies this migration cleanly.
--
-- Mirrors cron_drain_outbound_email exactly; see 20260530000003.
create or replace function public.cron_drain_blob_deletions()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url     text;
  v_secret  text;
  v_pending int;
begin
  select count(*) into v_pending
    from public.blob_deletion_queue
   where deleted_at is null
     and attempts < max_attempts
     and next_attempt_at <= now();
  if v_pending = 0 then
    return;
  end if;

  select value into v_url    from public.app_config where key = 'drain_blob_deletions_url';
  select value into v_secret from public.app_config where key = 'cron_secret';
  if v_url is null or v_secret is null then
    raise warning 'cron_drain_blob_deletions: drain_blob_deletions_url or cron_secret not configured in app_config';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke execute on function public.cron_drain_blob_deletions() from public, anon, authenticated;


-- ─── 6. Schedules ───────────────────────────────────────────────────
-- Idempotent unschedule-then-schedule so re-applying this migration does
-- not pile up duplicate cron rows.
do $$
declare
  j text;
begin
  foreach j in array array[
    'purge-expired-posts-hourly',
    'purge-upload-tickets-hourly',
    'purge-moderation-records-daily',
    'drain-blob-deletions'
  ]
  loop
    begin
      perform cron.unschedule(j);
    exception when others then
      null;  -- no-op if the job doesn't exist yet
    end;
  end loop;
end;
$$;

-- Hourly rather than daily: a 7-day retention promise reads better when
-- the longest a post outlives it is an hour, not a day.
select cron.schedule(
  'purge-expired-posts-hourly',
  '15 * * * *',
  $$select public.purge_expired_posts();$$
);

select cron.schedule(
  'purge-upload-tickets-hourly',
  '25 * * * *',
  $$select public.purge_stale_upload_tickets();$$
);

-- 02:35, after purge_rejected_listings at 02:30.
select cron.schedule(
  'purge-moderation-records-daily',
  '35 2 * * *',
  $$select public.purge_moderation_records();$$
);

-- Offset from the email drain's */5 so the two don't fire together.
select cron.schedule(
  'drain-blob-deletions',
  '2-57/5 * * * *',
  $$select public.cron_drain_blob_deletions();$$
);

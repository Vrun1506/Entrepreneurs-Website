-- ════════════════════════════════════════════════════════════════════
-- Foundry · Outbound email queue + drain cron
--
-- Resend's free tier is 100 emails/day and ~2 requests/sec. Two
-- realistic failure modes:
--
--   1. The annual graduate cleanup deletes dozens of student
--      accounts in one server action and currently sends each
--      congrats email inline. On a 200-grad cohort this both
--      exceeds Resend's per-second rate and blows past Vercel's
--      function timeout.
--
--   2. Any bursty admin moment (reviewing a backlog of listings)
--      can trip Resend's per-day cap. The current sender just
--      throws and the action surfaces a failure to the admin.
--
-- The queue fixes both:
--   - Bulk paths enqueue rows directly. The drainer spreads sends
--     across runs.
--   - Fast paths (sendEmail in lib/email.ts) try Resend once with
--     one transient retry, and on 429 / 5xx / network drop the
--     message into the queue rather than failing the user action.
--
-- A pg_cron job fires every 5 minutes and POSTs to a Next.js route
-- via pg_net. The route uses the Supabase service role key to drain
-- a bounded batch with exponential backoff per row.
--
-- app_config holds the drain URL + shared cron secret. RLS denies
-- all reads from authenticated / anon; only the cron job (running
-- as superuser) can read the values. The secret is also the bearer
-- token the Next.js route validates on the way in.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── 1. app_config ──────────────────────────────────────────────────
-- Opaque key/value store for runtime config that shouldn't live in
-- migrations. Currently used for the drain URL + cron secret; future
-- runtime config can land here too.
create table if not exists public.app_config (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
-- No policies defined → no SELECT/INSERT/UPDATE/DELETE allowed for
-- authenticated or anon. Only the postgres / supabase_admin role
-- (which owns the pg_cron jobs) can read this.

-- ─── 2. outbound_email queue ────────────────────────────────────────
create table if not exists public.outbound_email (
  id                  uuid        primary key default gen_random_uuid(),
  to_address          text        not null check (length(to_address)  between 3 and 320),
  subject             text        not null check (length(subject)     between 1 and 998),
  text_body           text        not null,
  html_body           text        not null,
  reply_to            text,
  created_at          timestamptz not null default now(),
  attempts            int         not null default 0,
  max_attempts        int         not null default 6,
  last_attempted_at   timestamptz,
  next_attempt_at     timestamptz not null default now(),
  sent_at             timestamptz,
  last_error          text,
  provider_message_id text
);

-- Drainer scans by (next_attempt_at) filtered to pending rows.
create index if not exists outbound_email_pending_idx
  on public.outbound_email (next_attempt_at)
  where sent_at is null;

-- Cheap admin diagnostic: "are any rows stuck?".
create index if not exists outbound_email_failed_idx
  on public.outbound_email (created_at desc)
  where sent_at is null and attempts >= max_attempts;

alter table public.outbound_email enable row level security;
-- No policies defined → authenticated/anon cannot read or write
-- directly. Enqueue happens through the SECURITY DEFINER RPC below.
-- The drainer uses the service role key, which bypasses RLS.

-- ─── 3. Enqueue RPCs for application code ───────────────────────────
-- Single-row enqueue, called from lib/email.ts when Resend returns
-- 429/5xx/network and we want to retry later. Authenticated callers
-- are trusted because this is invoked from server actions on behalf
-- of approved members or admins, and the payload is constructed from
-- vetted templates (lib/email.ts) — not arbitrary user input.
create or replace function public.enqueue_outbound_email(
  p_to       text,
  p_subject  text,
  p_text     text,
  p_html     text,
  p_reply_to text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Forbidden: sign-in required' using errcode = '42501';
  end if;

  insert into public.outbound_email (to_address, subject, text_body, html_body, reply_to)
  values (p_to, p_subject, p_text, p_html, p_reply_to)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.enqueue_outbound_email(text, text, text, text, text)
  to authenticated;

-- Bulk enqueue for paths that deliberately want to enqueue (grad
-- cleanup). Admin-only — the bulk path lets an admin spray to
-- thousands of addresses at once, so it needs the strongest gate.
-- Payload shape:
--   [{ "to": "...", "subject": "...", "text": "...", "html": "...",
--      "reply_to": "..." | null }, ...]
create or replace function public.enqueue_outbound_email_bulk(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: admin required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'enqueue_outbound_email_bulk: p_rows must be a JSON array' using errcode = '22023';
  end if;

  insert into public.outbound_email (to_address, subject, text_body, html_body, reply_to)
  select
    r->>'to',
    r->>'subject',
    r->>'text',
    r->>'html',
    nullif(r->>'reply_to', '')
  from jsonb_array_elements(p_rows) r;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.enqueue_outbound_email_bulk(jsonb)
  to authenticated;

-- ─── 4. Drainer claim RPC ───────────────────────────────────────────
-- Atomically pick up a batch of pending rows and lock them for the
-- duration of this drainer run by pushing next_attempt_at 10 minutes
-- into the future. `FOR UPDATE SKIP LOCKED` makes concurrent drainer
-- invocations cooperate. The drainer route increments `attempts` only
-- on a transient failure result — a successful or 429-throttled row
-- does not burn an attempt.
create or replace function public.claim_outbound_email_batch(p_limit int default 20)
returns table (
  id            uuid,
  to_address    text,
  subject       text,
  text_body     text,
  html_body     text,
  reply_to      text,
  attempts      int,
  max_attempts  int
)
language sql
security definer
set search_path = public
as $$
  update public.outbound_email oe
     set last_attempted_at = now(),
         next_attempt_at   = now() + interval '10 minutes'
   where oe.id in (
     select id from public.outbound_email
      where sent_at is null
        and attempts < max_attempts
        and next_attempt_at <= now()
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning oe.id, oe.to_address, oe.subject, oe.text_body, oe.html_body, oe.reply_to,
            oe.attempts, oe.max_attempts;
$$;

-- Only the service role (used by the drainer route) should call this;
-- authenticated callers have no business claiming queue rows.
revoke execute on function public.claim_outbound_email_batch(int) from public;

-- ─── 5. pg_cron driver ──────────────────────────────────────────────
-- Wrapper that decides whether to fire the HTTP POST. Avoids hammering
-- the Next.js route every 5 minutes when the queue is empty, and
-- silently no-ops if the runtime config rows haven't been seeded yet
-- (so the migration applies cleanly on a fresh DB before the user has
-- set drain_email_url / cron_secret in app_config).
create or replace function public.cron_drain_outbound_email()
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
    from public.outbound_email
   where sent_at is null
     and attempts < max_attempts
     and next_attempt_at <= now();

  if v_pending = 0 then
    return;
  end if;

  select value into v_url    from public.app_config where key = 'drain_email_url';
  select value into v_secret from public.app_config where key = 'cron_secret';

  if v_url is null or v_secret is null then
    raise warning 'cron_drain_outbound_email: drain_email_url or cron_secret not configured in app_config';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- Idempotent unschedule-then-schedule (matches the pattern in
-- migration 20260528000017_opportunities_expire_cron.sql).
do $$
begin
  perform cron.unschedule('drain-outbound-email');
exception when others then
  null;
end;
$$;

select cron.schedule(
  'drain-outbound-email',
  '*/5 * * * *',
  $$select public.cron_drain_outbound_email();$$
);

-- ─── 6. Queue diagnostics ───────────────────────────────────────────
-- Lightweight admin-only view of queue health. The admin UI can poll
-- this to render a "Queue: 0 pending / 0 failed" badge.
create or replace function public.admin_outbound_email_stats()
returns table (
  pending int,
  failed  int,
  sent_today int,
  oldest_pending_age_seconds int
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: admin required' using errcode = '42501';
  end if;
  return query
    select
      (select count(*)::int from public.outbound_email
        where sent_at is null and attempts < max_attempts),
      (select count(*)::int from public.outbound_email
        where sent_at is null and attempts >= max_attempts),
      (select count(*)::int from public.outbound_email
        where sent_at >= date_trunc('day', now())),
      coalesce((
        select extract(epoch from (now() - min(created_at)))::int
          from public.outbound_email
         where sent_at is null and attempts < max_attempts
      ), 0);
end;
$$;

grant execute on function public.admin_outbound_email_stats() to authenticated;

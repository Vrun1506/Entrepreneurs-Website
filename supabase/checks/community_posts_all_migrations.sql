-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — all six migrations, in order
--
-- FALLBACK ONLY. The supported path is `supabase db push`, which records
-- each migration in supabase_migrations.schema_migrations so a later push
-- does not try to re-apply it. This file does that bookkeeping itself, at
-- the end, so the two paths end up in the same state.
--
-- Runs as ONE transaction: either the whole feature lands or none of it
-- does. A half-applied schema is the worst outcome available here.
--
-- Paste into the Supabase SQL editor and run once.
-- ════════════════════════════════════════════════════════════════════

begin;


-- ══════ 20260829000001_community_posts.sql ══════

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — tables, RLS, triggers
--
-- The Community feed is the first content type on this project that
-- publishes WITHOUT admin review. Opportunities, events and VC/grants all
-- sit in a queue until an admin approves them; a feed cannot work that
-- way, so the safety model moves from pre-approval to: takedown speed, a
-- report route, rate limits, input sanitisation, and a short automatic
-- retention window.
--
-- Retention is the load-bearing part of this design, not a detail.
--
--   posts + images   destroyed 7 days after publication, by cron
--   moderation log   kept 12 months, admin takedowns only
--   reports          kept 12 months
--
-- Those two windows are quoted in the privacy policy, so they are stored
-- as data (`expires_at`, `purge_after`) rather than being implied by a
-- WHERE clause somewhere. A retention period you can SELECT is one you
-- can audit.
--
-- Note on the `ensure_rls` event trigger: it exists in prod and not in
-- this repo (see 20260608000002), so every table below enables RLS
-- explicitly rather than relying on it. A fresh local stack has no such
-- trigger.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. posts ───────────────────────────────────────────────────────
-- `kind`:
--   'member' — written by a member, deletable by them.
--   'system' — created when a listing is approved, so the feed is never
--              empty on a quiet week. Attributed to the listing's poster
--              but not deletable from the feed; removing the listing
--              removes the post (20260829000004).
--
-- author_id CASCADEs from auth.users, deliberately unlike the listing
-- tables which use `on delete restrict`. Restrict is why delete_my_account,
-- admin_delete_user, admin_delete_graduates and reject_user each carry an
-- explicit "delete their listings" line — four places to remember. Posts
-- are ephemeral user content with no approval metadata worth preserving,
-- so cascade is correct here and removes four chances to leave a deleted
-- member's words on the site.
create table if not exists public.posts (
  id           uuid        primary key default gen_random_uuid(),
  author_id    uuid        not null references auth.users(id) on delete cascade,
  kind         text        not null default 'member',
  title        text        not null,
  body         text        not null,
  -- System posts only: which listing produced this row.
  source_table text,
  source_id    uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',

  constraint posts_kind_valid  check (kind in ('member', 'system')),
  constraint posts_title_len   check (length(title) between 3 and 120),
  constraint posts_body_len    check (length(body)  between 1 and 3000),
  constraint posts_source_table_valid check (
    source_table is null or source_table in ('opportunities', 'events', 'vcs_grants')
  ),
  -- A system post must name its listing; a member post must not.
  constraint posts_source_consistency check (
    (kind = 'system' and source_table is not null and source_id is not null) or
    (kind = 'member' and source_table is null     and source_id is null)
  )
);

-- Feed keyset cursor. `(created_at desc, id desc)` matches the ORDER BY in
-- list_community_feed exactly, so the seek is a single index descent
-- regardless of how deep the reader has scrolled.
create index if not exists posts_feed_idx
  on public.posts (created_at desc, id desc);

-- "My posts", same cursor shape scoped to one author.
create index if not exists posts_author_feed_idx
  on public.posts (author_id, created_at desc, id desc);

-- The hourly purge.
create index if not exists posts_expires_at_idx
  on public.posts (expires_at);

-- One system post per listing. Re-approving a listing after an edit, or a
-- double-clicked approve button, would otherwise stack duplicates in the
-- feed; the inserts use `on conflict do nothing` against this.
create unique index if not exists posts_system_source_idx
  on public.posts (source_table, source_id)
  where kind = 'system';

alter table public.posts enable row level security;

-- Approved members and admins read the feed. Nothing else: a member whose
-- status is pending_review or rejected cannot see member-written content.
create policy posts_select_approved on public.posts
  for select to authenticated
  using (public.is_approved() or public.is_admin());

-- Authors delete their own member posts. System posts are not deletable
-- this way — they belong to the listing that created them.
create policy posts_delete_own on public.posts
  for delete to authenticated
  using (author_id = auth.uid() and kind = 'member');

-- Admins delete anything. The reason-and-email path goes through
-- admin_delete_post; this policy is the backstop that RPC relies on.
create policy posts_delete_admin on public.posts
  for delete to authenticated
  using (public.is_admin());

-- No INSERT policy and no UPDATE policy, on purpose.
--   INSERT: only create_post, which enforces the kill switch, the ticket
--           ownership check and the duplicate check atomically.
--   UPDATE: posts are immutable. Editing a post that carries a takedown
--           audit trail and a 7-day life is not worth the versioning it
--           would need, so immutability is a table property rather than
--           something the UI merely declines to offer.


-- ─── 2. post_images ─────────────────────────────────────────────────
-- Stores the CONTAINER-RELATIVE KEY, never a URL. Read URLs are
-- short-expiry SAS minted per render, so a stored URL would be stale
-- almost immediately — and keeping the host out of the data means moving
-- storage later is a config change rather than a data migration.
--
-- alt_text is NOT NULL: an image on a members-only feed with no text
-- alternative is unreadable to anyone using a screen reader, and the
-- composer is the only place that can reasonably ask for it.
create table if not exists public.post_images (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  blob_key   text        not null unique,
  alt_text   text        not null,
  width      integer     not null,
  height     integer     not null,
  byte_size  integer     not null,
  position   smallint    not null,
  created_at timestamptz not null default now(),

  constraint post_images_alt_len   check (length(alt_text) between 1 and 200),
  constraint post_images_position  check (position in (1, 2)),
  constraint post_images_dims      check (width between 1 and 8000 and height between 1 and 8000),
  constraint post_images_byte_size check (byte_size between 1 and 8388608),
  unique (post_id, position)
);

-- FK index for the cascade path, per the convention set in 20260827000002.
create index if not exists post_images_post_idx
  on public.post_images (post_id);

alter table public.post_images enable row level security;

-- Visible exactly when the parent post is visible.
create policy post_images_select on public.post_images
  for select to authenticated
  using (
    exists (
      select 1 from public.posts p
       where p.id = post_images.post_id
         and (public.is_approved() or public.is_admin())
    )
  );

-- No write policies: rows arrive via create_post and leave via cascade.


-- ─── 3. upload_tickets ──────────────────────────────────────────────
-- Bridges "image uploaded" and "post created". The gateway writes bytes
-- to Blob before any post row exists, so something has to remember that a
-- key was legitimately handed out.
--
-- Two jobs:
--   1. create_post verifies a submitted blob_key was actually issued to
--      the caller, instead of trusting a string from the browser.
--   2. The hourly sweep finds abandoned uploads with a table query rather
--      than enumerating a Blob container.
create table if not exists public.upload_tickets (
  blob_key    text        primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  purpose     text        not null,
  issued_at   timestamptz not null default now(),
  consumed_at timestamptz,

  -- 'profile_picture' and 'cv' are reserved for the features that will
  -- reuse this gateway; only 'post_image' is issued today.
  constraint upload_tickets_purpose check (purpose in ('post_image', 'profile_picture', 'cv'))
);

create index if not exists upload_tickets_user_idx
  on public.upload_tickets (user_id);

-- Drives the orphan sweep; partial so it only indexes rows still in play.
create index if not exists upload_tickets_unconsumed_idx
  on public.upload_tickets (issued_at)
  where consumed_at is null;

alter table public.upload_tickets enable row level security;
-- No policies → deny-all. Reached only through issue_upload_ticket and
-- create_post, both SECURITY DEFINER, and the service-role sweep.


-- ─── 4. blob_deletion_queue ─────────────────────────────────────────
-- Modelled on outbound_email (20260530000003): same attempts / backoff /
-- dead-letter shape, drained by a Next.js route on a pg_cron trigger.
--
-- WHY A POSTGRES TABLE AND NOT AN AZURE STORAGE QUEUE.
-- The deletion job has to commit atomically with the row deletion that
-- caused it. Written by a trigger inside the same transaction, the two
-- cannot diverge. An external queue makes this a dual write — delete the
-- row, then enqueue — and a failure between the two leaves an orphaned
-- blob with nothing recording that it ever existed. That is precisely the
-- erasure failure this queue exists to prevent, so the queue must live
-- where the transaction is.
create table if not exists public.blob_deletion_queue (
  id              uuid        primary key default gen_random_uuid(),
  blob_key        text        not null,
  enqueued_at     timestamptz not null default now(),
  attempts        int         not null default 0,
  max_attempts    int         not null default 6,
  next_attempt_at timestamptz not null default now(),
  deleted_at      timestamptz,
  last_error      text
);

create index if not exists blob_deletion_pending_idx
  on public.blob_deletion_queue (next_attempt_at)
  where deleted_at is null;

create index if not exists blob_deletion_failed_idx
  on public.blob_deletion_queue (enqueued_at desc)
  where deleted_at is null and attempts >= max_attempts;

alter table public.blob_deletion_queue enable row level security;
-- No policies → service role only.


-- ─── 5. post_reports ────────────────────────────────────────────────
-- The report route is not optional. A UK user-to-user service has to run
-- a complaints mechanism and act on illegal content once it knows about
-- it; a report button whose rows nobody reads is worse than no button,
-- because it is a documented notification that was demonstrably ignored.
-- /admin/reports is the other half of this table.
--
-- post_id is `on delete set null` and the title is snapshotted, so a
-- report survives the post it is about — otherwise removing a post would
-- erase the evidence that anyone objected to it.
--
-- Categories are a fixed list rather than free text so the queue can be
-- triaged by severity; they are shaped around the illegal-content
-- categories a UK service is expected to act on.
create table if not exists public.post_reports (
  id                  uuid        primary key default gen_random_uuid(),
  post_id             uuid        references public.posts(id) on delete set null,
  post_title_snapshot text        not null,
  reporter_id         uuid        references auth.users(id) on delete set null,
  category            text        not null,
  reason              text        not null,
  status              text        not null default 'open',
  resolved_by         uuid        references auth.users(id) on delete set null,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz not null default now(),
  purge_after         timestamptz not null default now() + interval '12 months',

  constraint post_reports_category check (
    category in ('illegal', 'harassment', 'hate', 'sexual', 'spam', 'misinformation', 'other')
  ),
  constraint post_reports_status check (status in ('open', 'actioned', 'dismissed')),
  constraint post_reports_reason_len check (length(reason) between 1 and 1000),
  constraint post_reports_resolution check (
    (status = 'open'  and resolved_at is null     and resolved_by is null) or
    (status <> 'open' and resolved_at is not null and resolved_by is not null)
  )
);

-- One report per person per post. The cheapest defence against
-- report-bombing — a member mass-reporting someone they dislike — and the
-- same "make the duplicate impossible" move 20260827000003 used to bound
-- listing_events. NULLs are distinct in a Postgres unique index, so this
-- stops constraining once the post is gone, which is correct: the rows
-- are history at that point, not a live queue.
create unique index if not exists post_reports_one_per_reporter_idx
  on public.post_reports (post_id, reporter_id);

-- The admin queue: open reports, newest first.
create index if not exists post_reports_status_idx
  on public.post_reports (status, created_at desc);

create index if not exists post_reports_post_idx
  on public.post_reports (post_id);

-- The 12-month purge.
create index if not exists post_reports_purge_idx
  on public.post_reports (purge_after);

alter table public.post_reports enable row level security;
-- No policies → deny-all. report_post writes; admin_list_post_reports and
-- admin_resolve_post_report read and update. A reporter cannot read the
-- table back: knowing which of your posts has been reported, and by whom,
-- is exactly what makes reporting unsafe to use.


-- ─── 6. post_moderation_log ─────────────────────────────────────────
-- Written ONLY on admin takedown. Not on self-delete, not on expiry —
-- nothing happened in those cases worth recording, and logging them would
-- retain content we had a duty to destroy.
--
-- TWO DELIBERATE CHOICES, both of which a reviewer should understand
-- before changing them.
--
-- 1. NO FOREIGN KEY on author_id or post_id.
--    If author_id cascaded from auth.users, a member could destroy the
--    record of their own moderation by deleting their account — and this
--    log exists precisely for the case where that record matters. It is
--    stored as a bare uuid plus an email snapshot so it survives. This
--    follows the precedent already set by admin_actions.target_id, which
--    is FK-free for the same reason. Lawful basis for retaining it past
--    an erasure request: UK GDPR Article 17(3)(e), retention for the
--    establishment, exercise or defence of legal claims.
--
-- 2. body_snapshot IS retained, for 12 months.
--    "We removed a post for reason X" without the post is close to
--    worthless the moment someone appeals, and that is the only moment
--    this table is ever read. Retention is bounded and enforced by cron,
--    and `legal_hold` lets a single record outlive the window when a
--    claim is actually live — so the purge never has to be disabled for
--    everyone to preserve one row.
create table if not exists public.post_moderation_log (
  id                    uuid        primary key default gen_random_uuid(),
  post_id               uuid        not null,
  author_id             uuid,
  author_email_snapshot text,
  admin_id              uuid,
  reason                text        not null,
  title_snapshot        text        not null,
  body_snapshot         text        not null,
  image_count           smallint    not null default 0,
  posted_at             timestamptz not null,
  removed_at            timestamptz not null default now(),
  purge_after           timestamptz not null default now() + interval '12 months',
  legal_hold            boolean     not null default false,

  constraint post_moderation_log_reason_len check (length(reason) between 1 and 2000)
);

create index if not exists post_moderation_log_author_idx
  on public.post_moderation_log (author_id, removed_at desc);

-- The purge scans this; partial so held rows are never even considered.
create index if not exists post_moderation_log_purge_idx
  on public.post_moderation_log (purge_after)
  where legal_hold = false;

alter table public.post_moderation_log enable row level security;
-- No policies → deny-all, including for admins. Read it with the service
-- role or from the SQL editor. An audit log the application can read is
-- one the application can be tricked into leaking.


-- ─── 7. Blob deletion trigger ───────────────────────────────────────
-- THE single point where image bytes get scheduled for destruction.
--
-- Hanging this off `post_images` AFTER DELETE rather than putting a
-- delete call in each code path means one trigger covers all of them:
-- author delete, admin takedown, 7-day expiry, ban cascade, and account
-- deletion. There is no way to remove an image row without scheduling its
-- bytes, which is what makes an erasure request actually complete rather
-- than merely appear to.
create or replace function public.tg_enqueue_blob_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.blob_deletion_queue (blob_key)
  values (old.blob_key);
  return old;
end;
$$;

drop trigger if exists post_images_enqueue_blob_deletion on public.post_images;
create trigger post_images_enqueue_blob_deletion
  after delete on public.post_images
  for each row
  execute function public.tg_enqueue_blob_deletion();


-- ─── 8. Ban cascade ─────────────────────────────────────────────────
-- A ban on this project is `profiles.status = 'rejected'`. Their posts go
-- with them: leaving a banned member's words in the feed is the outcome
-- the ban exists to prevent, and the images follow via the cascade into
-- post_images and the trigger above.
--
-- A trigger on the status transition rather than a line inside a specific
-- RPC, so it catches every route to 'rejected' — including admin_functions,
-- the onboarding paths, and a manual UPDATE in the SQL editor.
create or replace function public.tg_purge_posts_on_ban()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.posts where author_id = new.id;
  return new;
end;
$$;

drop trigger if exists profiles_purge_posts_on_ban on public.profiles;
create trigger profiles_purge_posts_on_ban
  after update of status on public.profiles
  for each row
  when (new.status = 'rejected' and old.status is distinct from 'rejected')
  execute function public.tg_purge_posts_on_ban();


-- ─── 9. Function grant lockdown ─────────────────────────────────────
-- On this project `revoke ... from public` locks nothing: Supabase's
-- default privileges hand anon and authenticated a direct EXECUTE grant on
-- every function in `public`, so all three roles have to be named. See
-- 20260608000001 for the incident this rule came out of.
--
-- Postgres does not check EXECUTE privilege when a trigger fires, so
-- revoking from the trigger functions costs nothing and closes the door on
-- them being called directly.
revoke execute on function public.tg_enqueue_blob_deletion() from public, anon, authenticated;
revoke execute on function public.tg_purge_posts_on_ban()    from public, anon, authenticated;


-- ══════ 20260829000002_community_posts_rpcs.sql ══════

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — RPCs
--
-- Every write goes through a SECURITY DEFINER function rather than an
-- RLS insert policy, for the same reason submit_opportunity does: the
-- checks that matter (kill switch, upload-ticket ownership, duplicate
-- suppression) have to happen in the same transaction as the insert, and
-- a `with check` expression cannot express them.
--
-- Every guard is `is_approved() or is_admin()`, never `auth.uid() is not
-- null`. A ban here is `status = 'rejected'` and GoTrue's banned_until
-- takes up to an hour to invalidate an already-issued JWT, so a
-- just-banned member still presents a perfectly valid auth.uid(). That
-- was the bug 20260827000003 was written to fix; this file does not
-- reintroduce it.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Kill switch ─────────────────────────────────────────────────
-- app_config has no RLS policies at all, so authenticated cannot read it
-- directly — a definer function is the only way application code can see
-- a flag stored there. Default is CLOSED: if the row is missing (a fresh
-- database, a botched seed), posting is off rather than silently on.
--
-- This is the lever for the 2am problem — a spam wave, or a complaint
-- about the feature itself. One UPDATE, no deploy.
create or replace function public.posting_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value = 'true' from public.app_config where key = 'community_posts_enabled'),
    false
  );
$$;

revoke execute on function public.posting_enabled() from public, anon;
grant  execute on function public.posting_enabled() to authenticated;


-- ─── 2. issue_upload_ticket ─────────────────────────────────────────
-- Records that a blob key was legitimately handed to this member, so
-- create_post can later verify a submitted key instead of trusting a
-- string from the browser.
--
-- The key is generated HERE, not by the client. The CV spec sets the same
-- rule for the same reason: a user-supplied filename must never become a
-- path component.
create or replace function public.issue_upload_ticket(p_purpose text default 'post_image')
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_key    text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can upload images' using errcode = '42501';
  end if;
  if p_purpose <> 'post_image' then
    raise exception 'Unsupported upload purpose: %', p_purpose using errcode = '22023';
  end if;
  if not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  -- uuid, then the extension the gateway will actually write. The gateway
  -- re-encodes everything to WebP, so the key names the output format,
  -- not whatever was uploaded.
  v_key := gen_random_uuid()::text || '.webp';

  insert into public.upload_tickets (blob_key, user_id, purpose)
  values (v_key, v_caller, p_purpose);

  return v_key;
end;
$$;

revoke execute on function public.issue_upload_ticket(text) from public, anon;
grant  execute on function public.issue_upload_ticket(text) to authenticated;


-- ─── 3. create_post ─────────────────────────────────────────────────
-- p_images shape (0 to 2 entries):
--   [{"blob_key":"…","alt_text":"…","width":n,"height":n,"byte_size":n}]
--
-- The ticket check is the security boundary. Without it, a client could
-- submit any blob key — including one belonging to another member's post
-- — and attach someone else's image to its own words.
-- Returns the created row rather than just its id. The composer prepends the
-- new post to the feed it is already showing, so it needs the values the
-- database generated — created_at, expires_at — and the author's display
-- name. Returning them here makes that one round trip and, more importantly,
-- means the countdown on the new card comes from the same clock as the
-- purge job rather than from a second calculation in TypeScript that could
-- drift from it.
create or replace function public.create_post(
  p_title  text,
  p_body   text,
  p_images jsonb default '[]'::jsonb
)
returns table (
  id                uuid,
  created_at        timestamptz,
  expires_at        timestamptz,
  author_first_name text,
  author_surname    text,
  author_role       user_role
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller  uuid := auth.uid();
  v_post_id uuid;
  v_count   int;
  v_img     jsonb;
  v_pos     smallint := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can post' using errcode = '42501';
  end if;
  if not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  if jsonb_typeof(p_images) <> 'array' then
    raise exception 'create_post: p_images must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_images) > 2 then
    raise exception 'A post can have at most 2 images' using errcode = '22023';
  end if;

  -- Duplicate suppression. Catches the double-submit (a member clicking
  -- Post twice on a slow connection) and the laziest form of spam, and it
  -- does so without spending a rate-limit token on either.
  --
  -- Every column is table-qualified. `returns table (...)` declares OUT
  -- parameters named id / created_at / expires_at, and an unqualified
  -- reference to one of those inside the body resolves to the parameter
  -- rather than the column — Postgres rejects it as ambiguous at runtime,
  -- not at create time, so it fails on first call rather than on deploy.
  select count(*) into v_count
    from public.posts p
   where p.author_id = v_caller
     and p.kind = 'member'
     and p.title = p_title
     and p.body = p_body
     and p.created_at > now() - interval '24 hours';
  if v_count > 0 then
    raise exception 'You have already posted this in the last 24 hours' using errcode = '23505';
  end if;

  insert into public.posts (author_id, kind, title, body)
  values (v_caller, 'member', p_title, p_body)
  returning posts.id into v_post_id;  -- qualified: `id` is also an OUT param

  for v_img in select * from jsonb_array_elements(p_images)
  loop
    v_pos := v_pos + 1;

    -- Claim the ticket. The WHERE clause is the whole check: it must
    -- exist, belong to this caller, be for this purpose, and be unused.
    -- `not found` after this means at least one of those was false.
    update public.upload_tickets
       set consumed_at = now()
     where blob_key    = v_img->>'blob_key'
       and user_id     = v_caller
       and purpose     = 'post_image'
       and consumed_at is null;
    if not found then
      raise exception 'Image upload is no longer valid — please re-attach it'
        using errcode = '42501';
    end if;

    insert into public.post_images (post_id, blob_key, alt_text, width, height, byte_size, position)
    values (
      v_post_id,
      v_img->>'blob_key',
      v_img->>'alt_text',
      (v_img->>'width')::int,
      (v_img->>'height')::int,
      (v_img->>'byte_size')::int,
      v_pos
    );
  end loop;

  return query
  select p.id, p.created_at, p.expires_at, pr.first_name, pr.surname, pr.role
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.id = v_post_id;
end;
$$;

revoke execute on function public.create_post(text, text, jsonb) from public, anon;
grant  execute on function public.create_post(text, text, jsonb) to authenticated;


-- ─── 4. delete_my_post ──────────────────────────────────────────────
-- Ownership is re-checked in the body rather than left to the RLS policy,
-- matching update_opportunity: inside a SECURITY DEFINER function the
-- policy does not apply, so the body IS the security boundary.
create or replace function public.delete_my_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_author uuid;
  v_kind   text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select author_id, kind into v_author, v_kind
    from public.posts where id = p_post_id;
  if v_author is null then
    raise exception 'Post not found — it may have already been deleted';
  end if;
  if v_author <> v_caller then
    raise exception 'You can only delete your own posts' using errcode = '42501';
  end if;
  if v_kind <> 'member' then
    raise exception 'This post was created from a listing — remove the listing instead';
  end if;

  -- No moderation log row: the author removing their own words is not a
  -- moderation event, and recording it would retain content we were asked
  -- to destroy. Images follow via cascade; the trigger schedules the bytes.
  delete from public.posts where id = p_post_id;
end;
$$;

revoke execute on function public.delete_my_post(uuid) from public, anon;
grant  execute on function public.delete_my_post(uuid) to authenticated;


-- ─── 5. admin_delete_post ───────────────────────────────────────────
-- Returns the author's identity so the server action can send the
-- takedown notice — the same shape reject_opportunity uses since
-- 20260529000006, and for the same reason: the cascade destroys the
-- identity, so it has to be captured before the delete, not looked up
-- after it.
create or replace function public.admin_delete_post(p_post_id uuid, p_reason text)
returns table (email text, first_name text, title text, posted_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_post   public.posts%rowtype;
  v_email  text;
  v_first  text;
  v_images smallint;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if v_post.id is null then
    raise exception 'Post not found: %', p_post_id;
  end if;

  select au.email::text, p.first_name into v_email, v_first
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = v_post.author_id;

  select count(*) into v_images from public.post_images where post_id = p_post_id;

  -- Written BEFORE the delete. The snapshot is the point: "we removed a
  -- post for reason X" without the post is close to worthless the moment
  -- someone appeals, and an appeal is the only time this is ever read.
  insert into public.post_moderation_log (
    post_id, author_id, author_email_snapshot, admin_id, reason,
    title_snapshot, body_snapshot, image_count, posted_at
  )
  values (
    p_post_id, v_post.author_id, v_email, v_caller, trim(p_reason),
    v_post.title, v_post.body, v_images, v_post.created_at
  );

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_delete_post', 'posts', p_post_id, trim(p_reason));

  -- Any open reports about this post are now resolved by definition.
  update public.post_reports
     set status = 'actioned', resolved_by = v_caller, resolved_at = now(),
         resolution_note = 'Post removed by an admin.'
   where post_id = p_post_id and status = 'open';

  delete from public.posts where id = p_post_id;

  return query select v_email, v_first, v_post.title, v_post.created_at;
end;
$$;

revoke execute on function public.admin_delete_post(uuid, text) from public, anon;
grant  execute on function public.admin_delete_post(uuid, text) to authenticated, service_role;


-- ─── 6. report_post ─────────────────────────────────────────────────
-- Idempotent by way of the unique index: reporting twice succeeds
-- silently rather than erroring. Telling someone "you already reported
-- this" is a small information leak and no help to them.
create or replace function public.report_post(
  p_post_id  uuid,
  p_category text,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_title  text;
  v_author uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can report posts' using errcode = '42501';
  end if;

  select title, author_id into v_title, v_author from public.posts where id = p_post_id;
  if v_title is null then
    raise exception 'Post not found — it may have already been deleted';
  end if;
  if v_author = v_caller then
    raise exception 'You cannot report your own post';
  end if;

  insert into public.post_reports (post_id, post_title_snapshot, reporter_id, category, reason)
  values (p_post_id, v_title, v_caller, p_category, trim(p_reason))
  on conflict do nothing;
end;
$$;

revoke execute on function public.report_post(uuid, text, text) from public, anon;
grant  execute on function public.report_post(uuid, text, text) to authenticated;


-- ─── 7. admin_resolve_post_report ───────────────────────────────────
-- Returns the reporter's identity so the action can close the loop by
-- email. Telling a complainant what happened is the half of a complaints
-- process that is easiest to skip and the half that makes it real.
create or replace function public.admin_resolve_post_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
)
returns table (email text, first_name text, post_title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_report public.post_reports%rowtype;
  v_email  text;
  v_first  text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_status not in ('actioned', 'dismissed') then
    raise exception 'Status must be actioned or dismissed' using errcode = '22023';
  end if;

  select * into v_report from public.post_reports where id = p_report_id;
  if v_report.id is null then
    raise exception 'Report not found: %', p_report_id;
  end if;
  if v_report.status <> 'open' then
    raise exception 'That report has already been resolved';
  end if;

  update public.post_reports
     set status = p_status, resolved_by = v_caller, resolved_at = now(),
         resolution_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_report_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_resolve_post_report', 'post_reports', p_report_id,
          p_status || coalesce(': ' || nullif(trim(coalesce(p_note, '')), ''), ''));

  -- reporter_id is nullable (the reporter may have deleted their account
  -- since), so this can legitimately return no address.
  select au.email::text, p.first_name into v_email, v_first
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = v_report.reporter_id;

  return query select v_email, v_first, v_report.post_title_snapshot;
end;
$$;

revoke execute on function public.admin_resolve_post_report(uuid, text, text) from public, anon;
grant  execute on function public.admin_resolve_post_report(uuid, text, text) to authenticated, service_role;


-- ─── 8. Feed reads (keyset) ─────────────────────────────────────────
-- Keyset, not offset, because this is a feed and not a filtered list.
--
--   * Cost is constant with depth. Offset makes Postgres walk and discard
--     every skipped row, so page 50 costs fifty times page 1; a keyset
--     seek descends the index once whatever the depth.
--   * It cannot skip rows. The expiry job deletes posts underneath a
--     reader — with offset, a row removed above the window shifts
--     everything up and the next page silently omits a post. A cursor is
--     anchored to a row, not to a count.
--   * No count(*) over (). That window function scans the whole matched
--     set on every request and is the part that actually degrades; "load
--     more" does not need a total.
--
-- The RLS gate is re-asserted in the body: SECURITY DEFINER means the
-- policies on `posts` do not apply here.
--
-- Images ride along as a jsonb array rather than a second query, so
-- rendering a page of the feed is one round trip.
create or replace function public.list_community_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             int         default 20
)
returns table (
  id                uuid,
  kind              text,
  title             text,
  body              text,
  created_at        timestamptz,
  expires_at        timestamptz,
  author_id         uuid,
  author_first_name text,
  author_surname    text,
  author_role       user_role,
  source_table      text,
  source_id         uuid,
  images            jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.kind, p.title, p.body, p.created_at, p.expires_at,
    p.author_id, pr.first_name, pr.surname, pr.role,
    p.source_table, p.source_id,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'blob_key', pi.blob_key, 'alt_text', pi.alt_text,
                'width', pi.width, 'height', pi.height)
              order by pi.position)
         from public.post_images pi where pi.post_id = p.id),
      '[]'::jsonb
    )
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p_cursor_created_at is null
     or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_community_feed(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_community_feed(timestamptz, uuid, int) to authenticated;


-- Same cursor shape, scoped to the caller. System posts are excluded:
-- "My posts" means what you wrote here, and a system post is not
-- deletable from this page, so listing it would only offer a control that
-- does not work.
create or replace function public.list_my_posts(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             int         default 20
)
returns table (
  id         uuid,
  title      text,
  body       text,
  created_at timestamptz,
  expires_at timestamptz,
  images     jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.title, p.body, p.created_at, p.expires_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'blob_key', pi.blob_key, 'alt_text', pi.alt_text,
                'width', pi.width, 'height', pi.height)
              order by pi.position)
         from public.post_images pi where pi.post_id = p.id),
      '[]'::jsonb
    )
  from public.posts p
  where p.author_id = v_caller
    and p.kind = 'member'
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_my_posts(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_my_posts(timestamptz, uuid, int) to authenticated;


-- ─── 9. Admin report queue (offset) ─────────────────────────────────
-- Offset here, unlike the feed, because this is a filtered admin list
-- where "12 open reports, page 2 of 3" is the useful framing and the
-- reader wants a total. Same shape as admin_list_profiles: the count
-- rides on every row via a window function, so there is no second query.
create or replace function public.admin_list_post_reports(
  p_status text default 'open',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id                  uuid,
  post_id             uuid,
  post_title_snapshot text,
  post_still_exists   boolean,
  category            text,
  reason              text,
  status              text,
  created_at          timestamptz,
  resolved_at         timestamptz,
  resolution_note     text,
  reporter_first_name text,
  reporter_surname    text,
  author_first_name   text,
  author_surname      text,
  author_id           uuid,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  return query
  with matched as (
    select r.*, p.author_id as post_author_id
      from public.post_reports r
      left join public.posts p on p.id = r.post_id
     where p_status is null or p_status = 'all' or r.status = p_status
  ),
  counted as (
    select m.*, count(*) over () as total_count from matched m
  )
  select
    c.id, c.post_id, c.post_title_snapshot, (c.post_id is not null),
    c.category, c.reason, c.status, c.created_at, c.resolved_at, c.resolution_note,
    rep.first_name, rep.surname,
    auth_p.first_name, auth_p.surname, c.post_author_id,
    c.total_count
  from counted c
  left join public.profiles rep    on rep.id    = c.reporter_id
  left join public.profiles auth_p on auth_p.id = c.post_author_id
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke execute on function public.admin_list_post_reports(text, int, int) from public, anon;
grant  execute on function public.admin_list_post_reports(text, int, int) to authenticated, service_role;


-- ══════ 20260829000003_community_posts_crons.sql ══════

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


-- ══════ 20260829000004_community_system_posts.sql ══════

-- ════════════════════════════════════════════════════════════════════
-- Foundry · System posts — keep the Community feed from launching empty
--
-- A new feed's real risk is not too much content, it is too little. A
-- Community tab showing four posts reads as abandoned, and members stop
-- checking it before it ever gets going. So when an opportunity, event or
-- VC/grant is approved, the feed gains a card pointing at it — the
-- listings already flowing through the review queue seed the feed for
-- free, and they carry traffic back to the listing pages.
--
-- WHY TRIGGERS AND NOT EDITS TO THE APPROVE RPCS.
-- The obvious implementation is an INSERT inside approve_opportunity,
-- approve_event, approve_vc_grant and the three admin_create_* twins.
-- That is six `create or replace` statements against large existing
-- functions, and this codebase has been bitten twice by exactly that:
-- once by a dead overload when a signature drifted (20260601000000), and
-- once by the fact that `create or replace` re-runs Supabase's default
-- privileges and silently hands `anon` a fresh EXECUTE grant
-- (20260827000001). Six rewrites is six chances at both.
--
-- A trigger on the status column touches none of that, and covers more:
-- approve_* (an UPDATE to 'approved'), admin_create_* (an INSERT already
-- at 'approved'), and any future path including a manual UPDATE in the
-- SQL editor.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Shared insert ───────────────────────────────────────────────
-- Truncates to the column constraints rather than letting a long listing
-- description raise. A system post is a pointer to the listing, not a
-- copy of it, so losing the tail is the correct outcome.
--
-- The length floor matters: posts_title_len requires 3 characters, and a
-- listing row that somehow has a shorter title must not make approving it
-- fail. Skipping the feed card is a much better failure than blocking the
-- approval.
create or replace function public.create_system_post(
  p_source_table text,
  p_source_id    uuid,
  p_author_id    uuid,
  p_title        text,
  p_body         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_body  text := left(trim(coalesce(p_body,  '')), 3000);
begin
  if length(v_title) < 3 or length(v_body) < 1 then
    return;
  end if;

  -- `on conflict do nothing` against posts_system_source_idx. Re-approving
  -- a listing after an edit, or a double-clicked approve button, must not
  -- stack duplicate cards in the feed.
  insert into public.posts (author_id, kind, title, body, source_table, source_id)
  values (p_author_id, 'system', v_title, v_body, p_source_table, p_source_id)
  on conflict do nothing;
end;
$$;

revoke execute on function public.create_system_post(text, uuid, uuid, text, text)
  from public, anon, authenticated;


-- ─── 2. Per-table triggers ──────────────────────────────────────────
-- Each fires on the transition INTO 'approved' (and on an insert that is
-- already approved), and removes the card on the transition back out —
-- rejected, or expired. A listing that is no longer live should not still
-- be advertised in the feed; without that the card would linger until the
-- 7-day expiry caught it.
create or replace function public.tg_opportunity_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.create_system_post(
      'opportunities', new.id, new.posted_by,
      new.position_name || ' at ' || new.company,
      new.description
    );
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.posts
     where kind = 'system' and source_table = 'opportunities' and source_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.tg_event_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.create_system_post(
      'events', new.id, new.posted_by,
      new.title,
      new.description
    );
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.posts
     where kind = 'system' and source_table = 'events' and source_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.tg_vc_grant_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.create_system_post(
      'vcs_grants', new.id, new.posted_by,
      new.name,
      new.description
    );
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.posts
     where kind = 'system' and source_table = 'vcs_grants' and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_system_post on public.opportunities;
create trigger opportunities_system_post
  after insert or update of status on public.opportunities
  for each row execute function public.tg_opportunity_system_post();

drop trigger if exists events_system_post on public.events;
create trigger events_system_post
  after insert or update of status on public.events
  for each row execute function public.tg_event_system_post();

drop trigger if exists vcs_grants_system_post on public.vcs_grants;
create trigger vcs_grants_system_post
  after insert or update of status on public.vcs_grants
  for each row execute function public.tg_vc_grant_system_post();


-- ─── 3. Cleanup on listing deletion ─────────────────────────────────
-- source_id cannot be a real foreign key — it points at one of three
-- tables — so there is no cascade to lean on. Without these, deleting a
-- listing would leave a feed card linking to a 404 until the 7-day expiry
-- collected it.
create or replace function public.tg_delete_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.posts
   where kind = 'system'
     and source_table = tg_table_name
     and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists opportunities_delete_system_post on public.opportunities;
create trigger opportunities_delete_system_post
  after delete on public.opportunities
  for each row execute function public.tg_delete_system_post();

drop trigger if exists events_delete_system_post on public.events;
create trigger events_delete_system_post
  after delete on public.events
  for each row execute function public.tg_delete_system_post();

drop trigger if exists vcs_grants_delete_system_post on public.vcs_grants;
create trigger vcs_grants_delete_system_post
  after delete on public.vcs_grants
  for each row execute function public.tg_delete_system_post();


-- ─── 4. Grant lockdown ──────────────────────────────────────────────
-- Trigger functions do not need EXECUTE to fire, so revoking costs
-- nothing and stops them being callable directly. All three roles named,
-- per 20260608000001.
revoke execute on function public.tg_opportunity_system_post() from public, anon, authenticated;
revoke execute on function public.tg_event_system_post()       from public, anon, authenticated;
revoke execute on function public.tg_vc_grant_system_post()    from public, anon, authenticated;
revoke execute on function public.tg_delete_system_post()      from public, anon, authenticated;


-- ══════ 20260830000001_community_posts_hardening.sql ══════

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — post-build hardening
--
-- Five findings from auditing 20260829000001-4 against the running code.
-- Two of them are real holes; three are correctness.
--
--   1. An admin could delete a post through PostgREST, skipping the
--      moderation log entirely. HIGH.
--   2. Every abuse limit lived in the Next.js action, and the RPCs are
--      EXECUTE-able by `authenticated`, so a member with their own JWT
--      could bypass all of them. HIGH.
--   3. Feed reads showed posts past expires_at until the hourly purge
--      caught up.
--   4. The admin report queue paged without a tiebreaker.
--   5. (In the app, not here.) Upload tickets drew from the posting
--      allowance — see lib/ratelimit.ts.
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. Admins delete through the RPC, or not at all ────────────────
-- 20260829000001 shipped a `posts_delete_admin` RLS policy described as
-- "the backstop that RPC relies on". That was wrong twice over.
--
-- It is not needed: admin_delete_post is SECURITY DEFINER owned by the
-- role that owns `posts`, and a table owner bypasses RLS, so the policy
-- was never consulted on the RPC path.
--
-- And it is harmful: it made `DELETE /rest/v1/posts?id=eq.…` succeed for
-- any admin JWT. That path writes no post_moderation_log row, no
-- admin_actions row, resolves no reports and sends the author no notice —
-- it is a silent takedown. The whole reason this feature keeps a 12-month
-- moderation record is to be able to say what was removed, by whom and
-- why, including when the person asking is a regulator and the admin
-- account was compromised. A second, unlogged route defeats that.
--
-- Members keep posts_delete_own: it is exactly equivalent to
-- delete_my_post (same owner check, same kind check) and a member
-- deleting their own words is not an event anything needs to record.
drop policy if exists posts_delete_admin on public.posts;


-- ─── 2. Abuse limits that survive a direct RPC call ─────────────────
-- The Upstash limiter in lib/ratelimit.ts is the product control: it
-- gives the friendly message and it is what a member actually meets.
-- But `create_post`, `report_post` and `issue_upload_ticket` are all
-- granted to `authenticated`, so anyone who can open devtools can post
-- straight to PostgREST and never touch it.
--
-- On the listing tables that gap is survivable — a flood lands in an
-- approval queue and an admin bins it. This feature publishes
-- immediately to ~2,000 people, so the same gap is a live megaphone.
--
-- The ceilings below sit ABOVE the Upstash ones deliberately. Upstash
-- stays the limit members experience; these are the floor under it that
-- a forged request cannot get beneath. Equal numbers would let the two
-- race on their differing windows and surface the blunt database error
-- instead of the written one.
--
--   Upstash            database backstop
--   post    10 / 24h   15 / 24h
--   report   5 / 24h   10 / 24h
--   upload  40 / 24h   60 outstanding tickets

create or replace function public.issue_upload_ticket(p_purpose text default 'post_image')
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_key    text;
  v_open   int;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can upload images' using errcode = '42501';
  end if;
  if p_purpose <> 'post_image' then
    raise exception 'Unsupported upload purpose: %', p_purpose using errcode = '22023';
  end if;
  if not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  -- Outstanding, not issued-per-hour. An unconsumed ticket is a blob
  -- nobody references, so what needs bounding is how many a single member
  -- can have in flight — and the hourly sweep clears anything past 24h,
  -- which makes this a genuine ceiling rather than a running total.
  select count(*) into v_open
    from public.upload_tickets t
   where t.user_id = v_caller
     and t.consumed_at is null;
  if v_open >= 60 then
    raise exception 'Too many uploads in progress. Finish or discard a post first.'
      using errcode = '42501';
  end if;

  -- uuid, then the extension the gateway will actually write. The gateway
  -- re-encodes everything to WebP, so the key names the output format,
  -- not whatever was uploaded.
  v_key := gen_random_uuid()::text || '.webp';

  insert into public.upload_tickets (blob_key, user_id, purpose)
  values (v_key, v_caller, p_purpose);

  return v_key;
end;
$$;

revoke execute on function public.issue_upload_ticket(text) from public, anon;
grant  execute on function public.issue_upload_ticket(text) to authenticated;


create or replace function public.create_post(
  p_title  text,
  p_body   text,
  p_images jsonb default '[]'::jsonb
)
returns table (
  id                uuid,
  created_at        timestamptz,
  expires_at        timestamptz,
  author_first_name text,
  author_surname    text,
  author_role       user_role
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller  uuid := auth.uid();
  v_post_id uuid;
  v_count   int;
  v_img     jsonb;
  v_pos     smallint := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can post' using errcode = '42501';
  end if;
  if not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  if jsonb_typeof(p_images) <> 'array' then
    raise exception 'create_post: p_images must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_images) > 2 then
    raise exception 'A post can have at most 2 images' using errcode = '22023';
  end if;

  -- Rate backstop. Served by posts_author_feed_idx (author_id first), so
  -- this is an index range scan over one member's last day, not a table
  -- scan. Racy under concurrency — two simultaneous requests can both see
  -- 14 — and that is fine for a backstop whose job is to stop a loop, not
  -- to be exact.
  select count(*) into v_count
    from public.posts p
   where p.author_id = v_caller
     and p.kind = 'member'
     and p.created_at > now() - interval '24 hours';
  if v_count >= 15 then
    raise exception 'You have reached the daily posting limit.' using errcode = '42501';
  end if;

  -- Duplicate suppression. Catches the double-submit (a member clicking
  -- Post twice on a slow connection) and the laziest form of spam, and it
  -- does so without spending a rate-limit token on either.
  --
  -- Every column is table-qualified. `returns table (...)` declares OUT
  -- parameters named id / created_at / expires_at, and an unqualified
  -- reference to one of those inside the body resolves to the parameter
  -- rather than the column — Postgres rejects it as ambiguous at runtime,
  -- not at create time, so it fails on first call rather than on deploy.
  select count(*) into v_count
    from public.posts p
   where p.author_id = v_caller
     and p.kind = 'member'
     and p.title = p_title
     and p.body = p_body
     and p.created_at > now() - interval '24 hours';
  if v_count > 0 then
    raise exception 'You have already posted this in the last 24 hours' using errcode = '23505';
  end if;

  insert into public.posts (author_id, kind, title, body)
  values (v_caller, 'member', p_title, p_body)
  returning posts.id into v_post_id;  -- qualified: `id` is also an OUT param

  for v_img in select * from jsonb_array_elements(p_images)
  loop
    v_pos := v_pos + 1;

    -- Claim the ticket. The WHERE clause is the whole check: it must
    -- exist, belong to this caller, be for this purpose, and be unused.
    -- `not found` after this means at least one of those was false.
    update public.upload_tickets
       set consumed_at = now()
     where blob_key    = v_img->>'blob_key'
       and user_id     = v_caller
       and purpose     = 'post_image'
       and consumed_at is null;
    if not found then
      raise exception 'Image upload is no longer valid — please re-attach it'
        using errcode = '42501';
    end if;

    insert into public.post_images (post_id, blob_key, alt_text, width, height, byte_size, position)
    values (
      v_post_id,
      v_img->>'blob_key',
      v_img->>'alt_text',
      (v_img->>'width')::int,
      (v_img->>'height')::int,
      (v_img->>'byte_size')::int,
      v_pos
    );
  end loop;

  return query
  select p.id, p.created_at, p.expires_at, pr.first_name, pr.surname, pr.role
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.id = v_post_id;
end;
$$;

revoke execute on function public.create_post(text, text, jsonb) from public, anon;
grant  execute on function public.create_post(text, text, jsonb) to authenticated;


create or replace function public.report_post(
  p_post_id  uuid,
  p_category text,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_title  text;
  v_author uuid;
  v_count  int;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can report posts' using errcode = '42501';
  end if;

  -- Backstop against report-bombing driven straight at the RPC. The
  -- unique index already stops repeat reports of the SAME post; this is
  -- what stops one member working through everyone else's.
  select count(*) into v_count
    from public.post_reports r
   where r.reporter_id = v_caller
     and r.created_at > now() - interval '24 hours';
  if v_count >= 10 then
    raise exception 'You have reported several posts today. Please email us if something urgent needs attention.'
      using errcode = '42501';
  end if;

  select title, author_id into v_title, v_author from public.posts where id = p_post_id;
  if v_title is null then
    raise exception 'Post not found — it may have already been deleted';
  end if;
  if v_author = v_caller then
    raise exception 'You cannot report your own post';
  end if;

  insert into public.post_reports (post_id, post_title_snapshot, reporter_id, category, reason)
  values (p_post_id, v_title, v_caller, p_category, trim(p_reason))
  on conflict do nothing;
end;
$$;

revoke execute on function public.report_post(uuid, text, text) from public, anon;
grant  execute on function public.report_post(uuid, text, text) to authenticated;


-- ─── 3. Expired posts leave the feed on time ────────────────────────
-- purge_expired_posts runs hourly, so between expiry and the next run a
-- post could still be read. The privacy page says seven days; making the
-- read honour expires_at means the member-visible promise is exact and
-- the cron is only responsible for reclaiming the row and the bytes.
--
-- Costs nothing: the filter discards at most one hour of rows from a
-- window the index has already narrowed.
create or replace function public.list_community_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             int         default 20
)
returns table (
  id                uuid,
  kind              text,
  title             text,
  body              text,
  created_at        timestamptz,
  expires_at        timestamptz,
  author_id         uuid,
  author_first_name text,
  author_surname    text,
  author_role       user_role,
  source_table      text,
  source_id         uuid,
  images            jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.kind, p.title, p.body, p.created_at, p.expires_at,
    p.author_id, pr.first_name, pr.surname, pr.role,
    p.source_table, p.source_id,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'blob_key', pi.blob_key, 'alt_text', pi.alt_text,
                'width', pi.width, 'height', pi.height)
              order by pi.position)
         from public.post_images pi where pi.post_id = p.id),
      '[]'::jsonb
    )
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.expires_at > now()
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_community_feed(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_community_feed(timestamptz, uuid, int) to authenticated;


create or replace function public.list_my_posts(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             int         default 20
)
returns table (
  id         uuid,
  title      text,
  body       text,
  created_at timestamptz,
  expires_at timestamptz,
  images     jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.title, p.body, p.created_at, p.expires_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'blob_key', pi.blob_key, 'alt_text', pi.alt_text,
                'width', pi.width, 'height', pi.height)
              order by pi.position)
         from public.post_images pi where pi.post_id = p.id),
      '[]'::jsonb
    )
  from public.posts p
  where p.author_id = v_caller
    and p.kind = 'member'
    and p.expires_at > now()
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_my_posts(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_my_posts(timestamptz, uuid, int) to authenticated;


-- ─── 4. A stable order for the admin report queue ───────────────────
-- `order by created_at desc` alone is not a total order. Two reports
-- filed in the same tick can swap places between page 1 and page 2, so a
-- report is shown twice and another never at all — on a queue whose whole
-- job is that nothing gets missed. `id` breaks the tie deterministically.
create or replace function public.admin_list_post_reports(
  p_status text default 'open',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id                  uuid,
  post_id             uuid,
  post_title_snapshot text,
  post_still_exists   boolean,
  category            text,
  reason              text,
  status              text,
  created_at          timestamptz,
  resolved_at         timestamptz,
  resolution_note     text,
  reporter_first_name text,
  reporter_surname    text,
  author_first_name   text,
  author_surname      text,
  author_id           uuid,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  return query
  with matched as (
    select r.*, p.author_id as post_author_id
      from public.post_reports r
      left join public.posts p on p.id = r.post_id
     where p_status is null or p_status = 'all' or r.status = p_status
  ),
  counted as (
    select m.*, count(*) over () as total_count from matched m
  )
  select
    c.id, c.post_id, c.post_title_snapshot, (c.post_id is not null),
    c.category, c.reason, c.status, c.created_at, c.resolved_at, c.resolution_note,
    rep.first_name, rep.surname,
    auth_p.first_name, auth_p.surname, c.post_author_id,
    c.total_count
  from counted c
  left join public.profiles rep    on rep.id    = c.reporter_id
  left join public.profiles auth_p on auth_p.id = c.post_author_id
  order by c.created_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke execute on function public.admin_list_post_reports(text, int, int) from public, anon;
grant  execute on function public.admin_list_post_reports(text, int, int) to authenticated, service_role;


-- ══════ 20260830000002_report_post_returns_inserted.sql ══════

-- ════════════════════════════════════════════════════════════════════
-- Foundry · report_post tells the caller whether it actually filed
--
-- The Online Safety Act asks a user-to-user service to act on illegal
-- content once it knows about it. "Knowing" cannot mean a row in a table
-- somebody has to remember to open: a report nobody reads is worse than no
-- report button, because it is a documented notification that was
-- demonstrably ignored.
--
-- So a report now emails the moderation inbox. For that, the action has to
-- know whether a row was really inserted — report_post is idempotent by way
-- of the unique index and quietly swallows a repeat, and re-notifying on
-- every duplicate would train whoever reads that inbox to ignore it.
--
-- It returns the post title too, read from the database rather than taken
-- from the caller, for the same reason.
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres cannot change a
-- function's return type in place. The drop names the exact argument
-- signature so it removes this function rather than leaving a dead overload
-- behind — the trap 20260601000000 records.
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.report_post(uuid, text, text);

create function public.report_post(
  p_post_id  uuid,
  p_category text,
  p_reason   text
)
returns table (filed boolean, post_title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller   uuid := auth.uid();
  v_title    text;
  v_author   uuid;
  v_count    int;
  v_inserted boolean := false;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can report posts' using errcode = '42501';
  end if;

  -- Backstop against report-bombing driven straight at the RPC. The unique
  -- index already stops repeat reports of the SAME post; this is what stops
  -- one member working through everyone else's.
  select count(*) into v_count
    from public.post_reports r
   where r.reporter_id = v_caller
     and r.created_at > now() - interval '24 hours';
  if v_count >= 10 then
    raise exception 'You have reported several posts today. Please email us if something urgent needs attention.'
      using errcode = '42501';
  end if;

  select title, author_id into v_title, v_author from public.posts where id = p_post_id;
  if v_title is null then
    raise exception 'Post not found — it may have already been deleted';
  end if;
  if v_author = v_caller then
    raise exception 'You cannot report your own post';
  end if;

  insert into public.post_reports (post_id, post_title_snapshot, reporter_id, category, reason)
  values (p_post_id, v_title, v_caller, p_category, trim(p_reason))
  on conflict do nothing;

  -- FOUND after an INSERT ... ON CONFLICT DO NOTHING is false when the
  -- conflict fired. That is the whole signal: true means this is news.
  get diagnostics v_count = row_count;
  v_inserted := v_count > 0;

  -- The title comes from the database, never from the caller. It lands in a
  -- moderator's inbox, and a client-supplied one would let a reporter
  -- describe someone else's post however they liked.
  return query select v_inserted, v_title;
end;
$$;

revoke execute on function public.report_post(uuid, text, text) from public, anon;
grant  execute on function public.report_post(uuid, text, text) to authenticated;


-- ─── Record them, so `supabase db push` stays consistent afterwards ──
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260829000001', 'community_posts'),
  ('20260829000002', 'community_posts_rpcs'),
  ('20260829000003', 'community_posts_crons'),
  ('20260829000004', 'community_system_posts'),
  ('20260830000001', 'community_posts_hardening'),
  ('20260830000002', 'report_post_returns_inserted')
on conflict (version) do nothing;

commit;

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

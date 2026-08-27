-- ─── Index the foreign keys that deletes have to check ──────────────
-- Capacity review 2026-08-27.
--
-- Postgres indexes the *referenced* side of a foreign key automatically
-- (it has to — that's the primary key). It never indexes the
-- *referencing* side. So every delete of a referenced row runs the
-- referential-integrity check as a sequential scan of the referencing
-- table, once per deleted row.
--
-- Five FKs in this schema have no index behind them, and two of them
-- point at the tables that grow fastest:
--
--   listing_events.viewer_id -> auth.users        ON DELETE CASCADE
--     listing_events gains a row on every view, expand and click, and
--     nothing prunes it. Deleting a user therefore scans the whole
--     table. `admin_delete_graduates` deletes an entire cohort in one
--     statement — the RI trigger fires per row, so that is one full scan
--     of the largest table per graduate, inside a single transaction
--     holding locks. `reject_user` and `delete_my_account` take the same
--     path one user at a time.
--
--   opportunity_bookmarks.opportunity_id -> opportunities  ON DELETE CASCADE
--     The primary key is (user_id, opportunity_id), so its leading
--     column is the wrong one for this direction — it cannot serve a
--     lookup by opportunity_id. `purge_rejected_listings` runs nightly
--     and deletes in bulk.
--
--   {opportunities,events,vcs_grants}.approved_by -> auth.users  NO ACTION
--     NO ACTION still checks: Postgres must prove no referencing row
--     exists before it lets the referenced row go. Lower frequency —
--     these only bite when an *admin* account is deleted — but the same
--     scan, and the index is nearly free on tables this size.
--
-- All of these are cheap to carry: the columns are narrow, the write
-- volume on approved_by is negligible, and listing_events is
-- insert-only.
--
-- LOCKING. `create index` (without CONCURRENTLY) takes an ACCESS
-- EXCLUSIVE lock for the duration of the build, which blocks writes to
-- that table. On the current row counts that is well under a second. If
-- listing_events has grown large by the time this runs, build that one
-- by hand first — outside a transaction, so CONCURRENTLY is allowed:
--
--     create index concurrently if not exists listing_events_viewer_idx
--       on public.listing_events (viewer_id);
--
-- and this migration's `if not exists` then makes it a no-op. The
-- migration is not written with CONCURRENTLY because the CLI runs each
-- migration inside a transaction, where it is not permitted.

create index if not exists listing_events_viewer_idx
  on public.listing_events (viewer_id);

create index if not exists opportunity_bookmarks_opportunity_idx
  on public.opportunity_bookmarks (opportunity_id);

create index if not exists opportunities_approved_by_idx
  on public.opportunities (approved_by);

create index if not exists events_approved_by_idx
  on public.events (approved_by);

create index if not exists vcs_grants_approved_by_idx
  on public.vcs_grants (approved_by);

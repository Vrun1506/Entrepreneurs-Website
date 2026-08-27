-- ─── Bound and gate the analytics write path ────────────────────────
-- Security + capacity review 2026-08-27.
--
-- `record_listing_event` is called client-direct from the browser
-- (lib/analytics.ts), so it never passes through the Next middleware and
-- no Upstash bucket ever sees it. Two consequences, both fixed here.
--
-- 1. IT WAS UNBOUNDED. Every call inserted a row, with no uniqueness and
--    nothing pruning the table. Any signed-in member could insert rows
--    into the fastest-growing table in the schema at whatever rate their
--    browser managed, and the only ceiling was Supabase's own transport
--    limits. `mark_listing_action`, sitting right next to it, already had
--    `on conflict do nothing` and so was naturally bounded; this one did
--    not.
--
--    Deduplicating is semantically free. The sole reader of this table,
--    `get_my_listing_stats`, counts `distinct viewer_id` for BOTH views
--    and clicks, so the second and subsequent rows from the same viewer
--    already contributed nothing to any number the app displays. Keeping
--    one row per (listing, viewer, event_type) changes no output and caps
--    what one account can write at listings x event_types — a fixed
--    number, not a rate.
--
--    What it gives up: the ability to reconstruct a time series of repeat
--    views later, since only the first occurrence survives. That is a
--    real cost and it is taken deliberately — nothing reads it today, and
--    an aggregate table is the right way to add it back if it is ever
--    wanted, rather than an unbounded raw log open to the browser.
--
-- 2. IT ONLY CHECKED `auth.uid() is not null`. A ban on this project is
--    `status = 'rejected'`, and GoTrue's `banned_until` takes up to an
--    hour to stop an already-issued JWT — so a just-banned member kept
--    write access to the database through this function. It now requires
--    an approved member or an admin, matching `mark_listing_action` and
--    matching what the page guards already enforce (nobody below approved
--    can reach a listing page at all).

-- ─── 1. Collapse the existing duplicates ────────────────────────────
-- Keep the earliest row per group: first-seen is the more meaningful
-- timestamp, and it is what a dedup-on-insert would have left behind.
delete from public.listing_events le
 where exists (
   select 1
     from public.listing_events keep
    where keep.listing_kind = le.listing_kind
      and keep.listing_id   = le.listing_id
      and keep.viewer_id    = le.viewer_id
      and keep.event_type   = le.event_type
      and (keep.created_at, keep.id) < (le.created_at, le.id)
 );

-- ─── 2. Make the duplicate impossible ───────────────────────────────
-- Doubles as the index for the by-viewer lookups; the FK index added in
-- 20260827000002 stays for the cascade path, which needs viewer_id
-- leading.
create unique index if not exists listing_events_unique_view_idx
  on public.listing_events (listing_kind, listing_id, viewer_id, event_type);

-- ─── 3. Gate the writer and make it idempotent ──────────────────────
-- Signature unchanged (no new overload). Body is the original plus the
-- membership check and the conflict clause.
create or replace function public.record_listing_event(
  p_kind       listing_event_kind,
  p_id         uuid,
  p_event_type listing_event_type
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Forbidden: sign-in required' using errcode = '42501';
  end if;

  -- Admins are allowed through on status the same way the page guards let
  -- them through, so an admin browsing the member-facing UI for diagnosis
  -- doesn't start throwing here.
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  insert into public.listing_events (listing_kind, listing_id, viewer_id, event_type)
  values (p_kind, p_id, v_uid, p_event_type)
  on conflict do nothing;
end;
$$;

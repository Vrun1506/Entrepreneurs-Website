-- ════════════════════════════════════════════════════════════════════
-- Foundry · Make listing click counts distinct-by-viewer
--
-- get_my_listing_stats (migration 20260530000006) computed click_count as
-- count(*) over the click event types. record_listing_event lets any
-- authenticated user insert events for any listing_id with no dedup, so a
-- single member could spam apply_click / contact_click and arbitrarily
-- inflate the click total a poster sees on /my-submissions. (view_count was
-- already count(distinct viewer_id), so it was never inflatable beyond +1
-- per user — clicks should match that bound.)
--
-- Fix: count(distinct viewer_id) for clicks too. One viewer can now move a
-- listing's click_count by at most 1, regardless of how many events they
-- fire. No behavioural change for honest traffic (distinct humans clicking).
--
-- Signature is identical to 20260530000006 so CREATE OR REPLACE patches the
-- live function in place (no dead overload — see tasks/lessons.md).
-- ════════════════════════════════════════════════════════════════════

create or replace function public.get_my_listing_stats()
returns table (
  listing_kind public.listing_event_kind,
  listing_id   uuid,
  view_count   int,
  click_count  int
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    le.listing_kind,
    le.listing_id,
    count(distinct le.viewer_id) filter (where le.event_type = 'expand')::int,
    count(distinct le.viewer_id) filter (where le.event_type in ('apply_click', 'contact_click', 'external_click'))::int
  from public.listing_events le
  where le.viewer_id <> (select auth.uid())
    and (
      (le.listing_kind = 'opportunity' and exists (
        select 1 from public.opportunities o
         where o.id = le.listing_id and o.posted_by = (select auth.uid())
      ))
      or
      (le.listing_kind = 'event' and exists (
        select 1 from public.events e
         where e.id = le.listing_id and e.posted_by = (select auth.uid())
      ))
      or
      (le.listing_kind = 'vc_grant' and exists (
        select 1 from public.vcs_grants v
         where v.id = le.listing_id and v.posted_by = (select auth.uid())
      ))
    )
  group by le.listing_kind, le.listing_id;
$$;

grant execute on function public.get_my_listing_stats() to authenticated;

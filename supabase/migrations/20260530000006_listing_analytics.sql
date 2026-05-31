-- ════════════════════════════════════════════════════════════════════
-- Foundry · Per-listing analytics
--
-- Lightweight engagement tracking so posters can see how many people
-- looked at their opportunity / event / VC and how many clicked
-- through to apply or contact. Surfaced on /my-submissions next to
-- each row.
--
-- Design notes:
--   * Single denormalised events table — one row per recorded
--     interaction. Aggregation happens at query time via the
--     get_my_listing_stats RPC.
--   * listing_kind is an enum discriminator rather than a polymorphic
--     FK because the three listing tables have no common type.
--     listing_id has no FK, so rows for deleted listings linger
--     harmlessly until manual cleanup.
--   * Self-events (poster expanding their own card) are recorded but
--     excluded from the aggregation — we still capture them so the
--     storage cost is uniform and a future "your activity" report
--     can use them.
--   * Views = count(distinct viewer_id) on expand events. Clicks =
--     total apply_click + contact_click + external_click.
-- ════════════════════════════════════════════════════════════════════

create type public.listing_event_kind as enum ('opportunity', 'event', 'vc_grant');
create type public.listing_event_type as enum (
  'expand', 'apply_click', 'contact_click', 'external_click'
);

create table if not exists public.listing_events (
  id           uuid                       primary key default gen_random_uuid(),
  listing_kind public.listing_event_kind  not null,
  listing_id   uuid                       not null,
  viewer_id    uuid                       not null references auth.users(id) on delete cascade,
  event_type   public.listing_event_type  not null,
  created_at   timestamptz                not null default now()
);

-- Aggregation queries filter by listing_id + listing_kind; this index
-- covers both branches of the OR in get_my_listing_stats.
create index if not exists listing_events_by_listing_idx
  on public.listing_events (listing_kind, listing_id);

alter table public.listing_events enable row level security;
-- No direct policies: authenticated callers cannot SELECT/INSERT/UPDATE
-- /DELETE this table by hand. All access goes through the two RPCs
-- below, both of which are SECURITY DEFINER and check intent.

-- ─── Recording ──────────────────────────────────────────────────────
-- Fire-and-forget from the client. We don't validate that the listing
-- exists — out-of-band events for deleted/never-existed IDs are
-- harmless and the aggregation ignores them (they don't match any row
-- with posted_by = caller). This keeps the hot insert path cheap.
create or replace function public.record_listing_event(
  p_kind       public.listing_event_kind,
  p_id         uuid,
  p_event_type public.listing_event_type
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
  insert into public.listing_events (listing_kind, listing_id, viewer_id, event_type)
  values (p_kind, p_id, v_uid, p_event_type);
end;
$$;

grant execute on function public.record_listing_event(
  public.listing_event_kind, uuid, public.listing_event_type
) to authenticated;

-- ─── Aggregation for posters ────────────────────────────────────────
-- Returns one row per listing the caller posted that has at least one
-- non-self event. The /my-submissions page joins these counts onto
-- the caller's listings. Listings with zero events don't appear in
-- the result; the client treats their absence as (0, 0).
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
    count(*) filter (where le.event_type in ('apply_click', 'contact_click', 'external_click'))::int
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

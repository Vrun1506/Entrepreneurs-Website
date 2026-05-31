-- ════════════════════════════════════════════════════════════════════
-- Foundry · "Mark as applied / going" — user listing actions
--
-- Users can flag a listing they've signed up for ("applied" for an
-- opportunity or VC/grant, "going" for an event). Foundry takes their
-- word for it — there's no verification against the external site.
-- The flag drives the /my-activity page (one place to see everything
-- the user is doing) and feeds the in-app /calendar (events the user
-- is going to + opportunity / VC deadlines).
--
-- Design:
--   * Polymorphic (listing_kind, listing_id) like listing_events. No
--     true FK because the three listing tables share no common type.
--   * AFTER DELETE trigger on each listing table wipes the actions
--     when the underlying listing is deleted, mirroring the pattern in
--     20260531000002. We deliberately keep actions when a listing is
--     expired or status-changed — the user remembers having applied
--     even if the listing is no longer live.
--   * RLS is deny-all. Reads + writes flow through SECURITY DEFINER
--     RPCs that (a) verify the caller is approved, and (b) verify the
--     listing exists with the matching kind. This stops a malicious
--     authenticated session from spraying garbage rows.
--   * Action-type / listing-kind compatibility is enforced by a CHECK
--     constraint, so 'going' on a vc_grant or 'applied' on an event
--     is impossible at the row level even if a future RPC forgets.
-- ════════════════════════════════════════════════════════════════════

-- ─── Enum ───────────────────────────────────────────────────────────
create type public.user_action_type as enum ('applied', 'going');

-- ─── Table ──────────────────────────────────────────────────────────
create table public.user_listing_actions (
  user_id      uuid                       not null references auth.users(id) on delete cascade,
  listing_kind public.listing_event_kind  not null,
  listing_id   uuid                       not null,
  action_type  public.user_action_type    not null,
  created_at   timestamptz                not null default now(),
  primary key (user_id, listing_kind, listing_id, action_type),
  constraint user_listing_actions_kind_action_match check (
       (action_type = 'applied' and listing_kind in ('opportunity', 'vc_grant'))
    or (action_type = 'going'   and listing_kind = 'event')
  )
);

-- /my-activity and /calendar query by (user_id, listing_kind);
-- cleanup triggers query by (listing_kind, listing_id).
create index user_listing_actions_by_user_kind_idx
  on public.user_listing_actions (user_id, listing_kind);
create index user_listing_actions_by_listing_idx
  on public.user_listing_actions (listing_kind, listing_id);

alter table public.user_listing_actions enable row level security;
-- No policies defined → deny-all for authenticated and anon. All
-- access flows through the SECURITY DEFINER RPCs below.

-- ─── Mark ───────────────────────────────────────────────────────────
-- Idempotent on conflict (same user marking the same listing twice).
-- Validates the listing exists with the matching kind, and that the
-- caller is an approved member (only approved users see listings, so
-- only approved users should be able to flag them).
create or replace function public.mark_listing_action(
  p_kind   public.listing_event_kind,
  p_id     uuid,
  p_action public.user_action_type
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception 'Forbidden: sign-in required' using errcode = '42501';
  end if;
  if not public.is_approved() then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  -- Action/kind compatibility check duplicated here so the RPC gives a
  -- clean error before hitting the table-level CHECK.
  if not (
       (p_action = 'applied' and p_kind in ('opportunity', 'vc_grant'))
    or (p_action = 'going'   and p_kind = 'event')
  ) then
    raise exception 'action_type % is not valid for listing_kind %', p_action, p_kind
      using errcode = '22023';
  end if;

  -- Validate the listing exists. RLS on the listing tables is
  -- bypassed by SECURITY DEFINER, so we check status='approved' here
  -- explicitly — we don't want users marking pending or rejected
  -- listings (which they couldn't see anyway).
  case p_kind
    when 'opportunity' then
      select true into v_ok from public.opportunities where id = p_id and status = 'approved' limit 1;
    when 'event' then
      select true into v_ok from public.events        where id = p_id and status = 'approved' limit 1;
    when 'vc_grant' then
      select true into v_ok from public.vcs_grants    where id = p_id and status = 'approved' limit 1;
  end case;
  if v_ok is not true then
    raise exception 'Listing not found or not approved' using errcode = 'P0002';
  end if;

  insert into public.user_listing_actions (user_id, listing_kind, listing_id, action_type)
  values (v_uid, p_kind, p_id, p_action)
  on conflict do nothing;
end;
$$;

grant execute on function public.mark_listing_action(
  public.listing_event_kind, uuid, public.user_action_type
) to authenticated;

-- ─── Unmark ─────────────────────────────────────────────────────────
create or replace function public.unmark_listing_action(
  p_kind   public.listing_event_kind,
  p_id     uuid,
  p_action public.user_action_type
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
  delete from public.user_listing_actions
   where user_id      = v_uid
     and listing_kind = p_kind
     and listing_id   = p_id
     and action_type  = p_action;
end;
$$;

grant execute on function public.unmark_listing_action(
  public.listing_event_kind, uuid, public.user_action_type
) to authenticated;

-- ─── Read: my actions ──────────────────────────────────────────────
-- One row per (kind, id, action) for the calling user. The /my-activity
-- and /calendar pages join this to the underlying listing tables to
-- render titles, deadlines, locations, etc.
create or replace function public.get_my_listing_actions()
returns table (
  listing_kind public.listing_event_kind,
  listing_id   uuid,
  action_type  public.user_action_type,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select ula.listing_kind, ula.listing_id, ula.action_type, ula.created_at
    from public.user_listing_actions ula
   where ula.user_id = (select auth.uid())
   order by ula.created_at desc;
$$;

grant execute on function public.get_my_listing_actions() to authenticated;

-- ─── Read: full activity rows (joined to listing tables) ───────────
-- Returns a denormalised, kind-agnostic shape so /my-activity can
-- render every applied/going row without a follow-up join from the
-- application code. Uses SECURITY DEFINER so users see listings they
-- once marked even after expiry (RLS on the listing tables hides non-
-- approved rows from non-posters; this RPC bypasses that for the
-- caller's own action rows only).
--
-- Title and subtitle are pre-coerced into a uniform shape per kind:
--   * opportunity : title=position_name, subtitle=company
--   * event       : title=title,         subtitle=location
--   * vc_grant    : title=name,          subtitle=stage or kind
create or replace function public.get_my_activity()
returns table (
  listing_kind public.listing_event_kind,
  listing_id   uuid,
  action_type  public.user_action_type,
  marked_at    timestamptz,
  title        text,
  subtitle     text,
  status       text,
  occurs_at    timestamptz,
  url          text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with my as (
    select listing_kind, listing_id, action_type, created_at as marked_at
      from public.user_listing_actions
     where user_id = (select auth.uid())
  )
  select my.listing_kind, my.listing_id, my.action_type, my.marked_at,
         o.position_name::text   as title,
         o.company::text         as subtitle,
         o.status::text          as status,
         o.application_deadline  as occurs_at,
         o.apply_url             as url
    from my
    join public.opportunities o on o.id = my.listing_id
   where my.listing_kind = 'opportunity'
  union all
  select my.listing_kind, my.listing_id, my.action_type, my.marked_at,
         e.title::text           as title,
         e.location::text        as subtitle,
         e.status::text          as status,
         e.event_at              as occurs_at,
         e.luma_link             as url
    from my
    join public.events e on e.id = my.listing_id
   where my.listing_kind = 'event'
  union all
  select my.listing_kind, my.listing_id, my.action_type, my.marked_at,
         v.name::text                           as title,
         coalesce(v.stage::text, v.kind::text)  as subtitle,
         v.status::text                         as status,
         v.deadline                             as occurs_at,
         v.link                                 as url
    from my
    join public.vcs_grants v on v.id = my.listing_id
   where my.listing_kind = 'vc_grant';
$$;

grant execute on function public.get_my_activity() to authenticated;

-- ─── Cleanup triggers ──────────────────────────────────────────────
-- Same pattern as 20260531000002 for listing_events: one trigger per
-- listing table, parameterised with the discriminator value via
-- TG_ARGV. SECURITY DEFINER lets the trigger bypass RLS deny-all on
-- user_listing_actions.
create or replace function public.tg_cleanup_user_listing_actions_for_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_listing_actions
   where listing_kind = TG_ARGV[0]::public.listing_event_kind
     and listing_id   = OLD.id;
  return OLD;
end;
$$;

revoke all on function public.tg_cleanup_user_listing_actions_for_listing() from public;

drop trigger if exists opportunities_cleanup_user_actions on public.opportunities;
create trigger opportunities_cleanup_user_actions
  after delete on public.opportunities
  for each row execute function public.tg_cleanup_user_listing_actions_for_listing('opportunity');

drop trigger if exists events_cleanup_user_actions on public.events;
create trigger events_cleanup_user_actions
  after delete on public.events
  for each row execute function public.tg_cleanup_user_listing_actions_for_listing('event');

drop trigger if exists vcs_grants_cleanup_user_actions on public.vcs_grants;
create trigger vcs_grants_cleanup_user_actions
  after delete on public.vcs_grants
  for each row execute function public.tg_cleanup_user_listing_actions_for_listing('vc_grant');

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Protect contact_email from direct client-side reads
--
-- The `*_select_approved` RLS policies on opportunities and events gate
-- rows but not columns. Until this migration, any approved member
-- could call `supabase.from('opportunities').select('contact_email')`
-- from the browser and bypass the application-layer masking, which
-- broke the explicit Privacy Policy promise that emails stay hidden
-- unless the poster ticks "make visible".
--
-- The fix:
--   1. REVOKE column-level SELECT on `contact_email` from authenticated.
--      Direct PostgREST queries on this column now fail.
--   2. Expose the column through SECURITY DEFINER RPCs that decide,
--      inside the database, whether the caller is entitled to see the
--      raw value:
--        - the poster (`posted_by = auth.uid()`), or
--        - an admin (`public.is_admin()`), or
--        - any approved member when `contact_email_visible = true`.
--      Otherwise the column is masked to NULL.
--   3. Provide read RPCs the frontend can use in place of direct
--      `from(...).select(...)` for the affected pages: directory pages,
--      poster's own edit pages, and the admin review queues.
--
-- vcs_grants has no contact_email column, so it's unaffected.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Lock the column ──────────────────────────────────────────────
revoke select (contact_email) on public.opportunities from authenticated;
revoke select (contact_email) on public.events        from authenticated;

-- ─── 2a. Directory: list_approved_opportunities ──────────────────────
-- Returns rows the /opportunities page renders. contact_email is
-- masked unless the visibility flag is set, the caller is the poster,
-- or the caller is an admin. Includes the poster's name + LinkedIn so
-- the directory page no longer has to join.
create or replace function public.list_approved_opportunities()
returns table (
  id                     uuid,
  position_name          text,
  company                text,
  pay                    text,
  location_type          public.location_type,
  location_text          text,
  description            text,
  start_month            smallint,
  start_year             int,
  application_deadline   date,
  contact_email          text,
  contact_email_visible  boolean,
  apply_method           public.apply_method,
  apply_url              text,
  posted_by              uuid,
  created_at             timestamptz,
  poster_first_name      text,
  poster_surname         text,
  poster_linkedin_url    text,
  skill_names            text[],
  sector_names           text[]
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    o.id, o.position_name, o.company, o.pay,
    o.location_type, o.location_text,
    o.description, o.start_month, o.start_year,
    o.application_deadline,
    case
      when o.contact_email_visible
        or o.posted_by = (select auth.uid())
        or public.is_admin()
      then o.contact_email
      else null
    end,
    o.contact_email_visible,
    o.apply_method, o.apply_url,
    o.posted_by, o.created_at,
    p.first_name, p.surname, p.linkedin_url,
    coalesce((
      select array_agg(s.name order by s.name)
      from public.opportunity_skills os
      join public.skills s on s.id = os.skill_id
      where os.opportunity_id = o.id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(s.name order by s.name)
      from public.opportunity_sectors os
      join public.sectors s on s.id = os.sector_id
      where os.opportunity_id = o.id
    ), ARRAY[]::text[])
  from public.opportunities o
  left join public.profiles p on p.id = o.posted_by
  where o.status = 'approved'
    and o.application_deadline >= current_date
    and (public.is_approved() or public.is_admin())
  order by o.application_deadline asc;
$$;
grant execute on function public.list_approved_opportunities() to authenticated;

-- ─── 2b. Directory: list_approved_events ─────────────────────────────
create or replace function public.list_approved_events()
returns table (
  id                     uuid,
  title                  text,
  description            text,
  luma_link              text,
  event_at               timestamptz,
  location               text,
  organiser_name         text,
  contact_email          text,
  contact_email_visible  boolean,
  posted_by              uuid,
  created_at             timestamptz,
  poster_first_name      text,
  poster_surname         text,
  poster_linkedin_url    text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    e.id, e.title, e.description, e.luma_link,
    e.event_at, e.location, e.organiser_name,
    case
      when e.contact_email_visible
        or e.posted_by = (select auth.uid())
        or public.is_admin()
      then e.contact_email
      else null
    end,
    e.contact_email_visible,
    e.posted_by, e.created_at,
    p.first_name, p.surname, p.linkedin_url
  from public.events e
  left join public.profiles p on p.id = e.posted_by
  where e.status = 'approved'
    and e.event_at >= now()
    and (public.is_approved() or public.is_admin())
  order by e.event_at asc;
$$;
grant execute on function public.list_approved_events() to authenticated;

-- ─── 3a. Edit: get_opportunity_for_edit ──────────────────────────────
-- Returns the single row including contact_email when the caller is
-- the poster. Empty result otherwise (RLS-style — the edit page
-- treats missing as 404 already).
create or replace function public.get_opportunity_for_edit(p_id uuid)
returns table (
  id                     uuid,
  position_name          text,
  company                text,
  pay                    text,
  location_type          public.location_type,
  location_text          text,
  description            text,
  start_month            smallint,
  start_year             int,
  application_deadline   date,
  contact_email          text,
  contact_email_visible  boolean,
  apply_method           public.apply_method,
  apply_url              text,
  status                 public.listing_status,
  posted_by              uuid
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    o.id, o.position_name, o.company, o.pay,
    o.location_type, o.location_text,
    o.description, o.start_month, o.start_year,
    o.application_deadline,
    o.contact_email, o.contact_email_visible,
    o.apply_method, o.apply_url,
    o.status, o.posted_by
  from public.opportunities o
  where o.id = p_id
    and o.posted_by = (select auth.uid());
$$;
grant execute on function public.get_opportunity_for_edit(uuid) to authenticated;

-- ─── 3b. Edit: get_event_for_edit ────────────────────────────────────
create or replace function public.get_event_for_edit(p_id uuid)
returns table (
  id                     uuid,
  title                  text,
  description            text,
  luma_link              text,
  event_at               timestamptz,
  location               text,
  organiser_name         text,
  contact_email          text,
  contact_email_visible  boolean,
  status                 public.listing_status,
  posted_by              uuid
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    e.id, e.title, e.description, e.luma_link,
    e.event_at, e.location, e.organiser_name,
    e.contact_email, e.contact_email_visible,
    e.status, e.posted_by
  from public.events e
  where e.id = p_id
    and e.posted_by = (select auth.uid());
$$;
grant execute on function public.get_event_for_edit(uuid) to authenticated;

-- ─── 4a. Admin review: list_pending_opportunities_admin ──────────────
-- Returns pending opportunities with full contact_email for review.
-- Caller must be admin; non-admins receive an exception (not a silent
-- empty list — the admin page is gated and an unexpected call is
-- suspicious).
create or replace function public.list_pending_opportunities_admin()
returns table (
  id                     uuid,
  position_name          text,
  company                text,
  pay                    text,
  location_type          public.location_type,
  location_text          text,
  description            text,
  start_month            smallint,
  start_year             int,
  application_deadline   date,
  contact_email          text,
  contact_email_visible  boolean,
  apply_method           public.apply_method,
  apply_url              text,
  posted_by              uuid,
  created_at             timestamptz,
  poster_first_name      text,
  poster_surname         text,
  poster_linkedin_url    text,
  skill_names            text[],
  sector_names           text[]
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: admin required' using errcode = '42501';
  end if;
  return query
    select
      o.id, o.position_name, o.company, o.pay,
      o.location_type, o.location_text,
      o.description, o.start_month, o.start_year,
      o.application_deadline,
      o.contact_email, o.contact_email_visible,
      o.apply_method, o.apply_url,
      o.posted_by, o.created_at,
      p.first_name, p.surname, p.linkedin_url,
      coalesce((
        select array_agg(s.name order by s.name)
        from public.opportunity_skills os
        join public.skills s on s.id = os.skill_id
        where os.opportunity_id = o.id
      ), ARRAY[]::text[]),
      coalesce((
        select array_agg(s.name order by s.name)
        from public.opportunity_sectors os
        join public.sectors s on s.id = os.sector_id
        where os.opportunity_id = o.id
      ), ARRAY[]::text[])
    from public.opportunities o
    left join public.profiles p on p.id = o.posted_by
    where o.status = 'pending'
    order by o.created_at desc;
end;
$$;
grant execute on function public.list_pending_opportunities_admin() to authenticated;

-- ─── 4b. Admin review: list_pending_events_admin ─────────────────────
create or replace function public.list_pending_events_admin()
returns table (
  id                     uuid,
  title                  text,
  description            text,
  luma_link              text,
  event_at               timestamptz,
  location               text,
  organiser_name         text,
  contact_email          text,
  contact_email_visible  boolean,
  posted_by              uuid,
  created_at             timestamptz,
  poster_first_name      text,
  poster_surname         text,
  poster_linkedin_url    text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: admin required' using errcode = '42501';
  end if;
  return query
    select
      e.id, e.title, e.description, e.luma_link,
      e.event_at, e.location, e.organiser_name,
      e.contact_email, e.contact_email_visible,
      e.posted_by, e.created_at,
      p.first_name, p.surname, p.linkedin_url
    from public.events e
    left join public.profiles p on p.id = e.posted_by
    where e.status = 'pending'
    order by e.created_at desc;
end;
$$;
grant execute on function public.list_pending_events_admin() to authenticated;

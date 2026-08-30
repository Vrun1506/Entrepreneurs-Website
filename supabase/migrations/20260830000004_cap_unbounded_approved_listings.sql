-- ════════════════════════════════════════════════════════════════════
-- Foundry · Defensive row cap on the two approved-listing RPCs
--
-- list_approved_opportunities (20260530000002_protect_contact_email.sql)
-- and list_approved_events (latest body: 20260603000002_event_society_flag.sql)
-- are the member-facing directory feeds — the same category of gap
-- 20260830000003_cap_unbounded_admin_queries.sql closed for the two admin
-- review queues, missed on this pair because they are RPCs rather than
-- .from().select() chains, so the frontend-side ".limit(1000)" pattern
-- used for listApprovedVcs (frontend/src/lib/data/vcs.ts) doesn't reach
-- them — the limit has to live in the SQL body itself.
--
-- Both already self-prune by date (application_deadline >= current_date /
-- event_at >= now()), which is why this has run unbounded without incident
-- so far, but that bounds *when* a row drops off, not how many can be live
-- at once — nothing stops the count of currently-open opportunities or
-- upcoming events from growing past 1000 as membership grows. rows()
-- (frontend/src/lib/data/query.ts) already reports to Sentry the moment
-- either would hit PostgREST's 1000-row cap, so this closes the same gap
-- the admin-queries migration did: an explicit, intentional limit instead
-- of an implicit one nobody chose.
--
-- Both definitions below are the latest bodies verbatim with one `limit
-- 1000` line added before the closing `$$`. Signatures are unchanged, so
-- this REPLACES the live functions rather than creating a second overload.
-- ════════════════════════════════════════════════════════════════════

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
  order by o.application_deadline asc
  limit 1000;
$$;
grant execute on function public.list_approved_opportunities() to authenticated;

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
  is_society_event       boolean,
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
    e.is_society_event,
    e.posted_by, e.created_at,
    p.first_name, p.surname, p.linkedin_url
  from public.events e
  left join public.profiles p on p.id = e.posted_by
  where e.status = 'approved'
    and e.event_at >= now()
    and (public.is_approved() or public.is_admin())
  order by e.event_at asc
  limit 1000;
$$;
grant execute on function public.list_approved_events() to authenticated;

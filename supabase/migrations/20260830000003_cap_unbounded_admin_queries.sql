-- ════════════════════════════════════════════════════════════════════
-- Foundry · Defensive row cap on the two unbounded admin review RPCs
--
-- list_pending_opportunities_admin and list_pending_events_admin
-- (20260530000002_protect_contact_email.sql) have run with no LIMIT
-- since they were written. rows() (frontend/src/lib/data/query.ts)
-- already reports to Sentry the moment either query would hit
-- PostgREST's 1000-row cap, so this isn't a silent-truncation repeat of
-- that original bug — it's just the one place left where the "page it,
-- don't let it run unbounded" pattern applied to the member directory
-- and admin member list hasn't been applied. These are admin review
-- queues, not member-facing lists that grow with total membership, so a
-- flat `limit 1000` (matching MAX_ROWS) is proportionate — a real
-- pagination UI would be solving a problem these tables don't have.
--
-- Both definitions below are the 20260530000002 bodies verbatim with one
-- `limit 1000` line added before the closing `end;`. Signatures are
-- unchanged, so this REPLACES the live functions rather than creating a
-- second overload beside them.
-- ════════════════════════════════════════════════════════════════════

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
    order by o.created_at desc
    limit 1000;
end;
$$;
grant execute on function public.list_pending_opportunities_admin() to authenticated;

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
    order by e.created_at desc
    limit 1000;
end;
$$;
grant execute on function public.list_pending_events_admin() to authenticated;

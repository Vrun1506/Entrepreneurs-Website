-- ════════════════════════════════════════════════════════════════════
-- Foundry · Distinguish society events from external events
--
-- Admins want to mark certain events as official Imperial Entrepreneurs
-- ("society") events, rendered with a gold accent in the directory, vs.
-- the random external events members post (kept in the existing styling).
--
-- Security: the flag is ADMIN-ONLY. If any member could set it, they
-- could pass off an external event as an official society one
-- (impersonation). So:
--   • the column defaults to false;
--   • only admin_create_event (the admin direct-publish RPC) sets it true;
--   • a BEFORE INSERT OR UPDATE trigger rejects any attempt to set or
--     change is_society_event from a non-admin / non-service-role caller,
--     which also covers the user edit path (updateOwnEvent does a direct
--     PostgREST UPDATE gated only by RLS) and any hand-crafted insert.
--
-- Only list_approved_events() needs the new column on the read side: the
-- admin pending queue only ever shows user-submitted (external) events,
-- and get_event_for_edit only returns pending rows (also always external),
-- so neither is touched.
-- ════════════════════════════════════════════════════════════════════

-- ─── Column ──────────────────────────────────────────────────────────
alter table public.events
  add column if not exists is_society_event boolean not null default false;

-- ─── Flag-protect trigger ────────────────────────────────────────────
create or replace function public.tg_events_protect_society_flag()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- A row may only be born a society event if an admin / service-role
    -- creates it. Regular submissions default to false and pass straight
    -- through (is_admin() is not even evaluated).
    if new.is_society_event
       and not (auth.role() = 'service_role' or public.is_admin()) then
      raise exception 'Only admins can mark an event as a society event'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: only admins / service-role may flip the flag either way.
  if new.is_society_event is distinct from old.is_society_event then
    if not (auth.role() = 'service_role' or public.is_admin()) then
      raise exception 'Only admins can change the society-event flag'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists events_protect_society_flag on public.events;
create trigger events_protect_society_flag
  before insert or update on public.events
  for each row execute function public.tg_events_protect_society_flag();

-- ─── admin_create_event: +p_is_society_event ────────────────────────
-- Adding a parameter changes the signature, so DROP the old 8-arg
-- overload first — otherwise CREATE OR REPLACE would leave a dead
-- second function instead of replacing the live one.
drop function if exists public.admin_create_event(
  text, text, text, timestamptz, text, text, text, boolean
);

create or replace function public.admin_create_event(
  p_title                 text,
  p_description           text,
  p_luma_link             text,
  p_event_at              timestamptz,
  p_location              text,
  p_organiser_name        text,
  p_contact_email         text,
  p_contact_email_visible boolean,
  p_is_society_event      boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
  v_new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_event_at is null or p_event_at < now() then
    raise exception 'Event start time must be in the future';
  end if;

  v_email := nullif(trim(coalesce(p_contact_email, '')), '');
  if v_email is null then
    select email into v_email from auth.users where id = v_caller;
  end if;

  insert into public.events (
    posted_by, status,
    title, description, luma_link,
    event_at, location, organiser_name,
    contact_email, contact_email_visible,
    is_society_event,
    approved_at, approved_by
  ) values (
    v_caller, 'approved',
    p_title, p_description, p_luma_link,
    p_event_at, p_location, p_organiser_name,
    v_email, coalesce(p_contact_email_visible, false),
    coalesce(p_is_society_event, false),
    now(), v_caller
  )
  returning id into v_new_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_create_event', 'events', v_new_id, null);

  return v_new_id;
end;
$$;

grant execute on function public.admin_create_event(text, text, text, timestamptz, text, text, text, boolean, boolean) to authenticated;

-- ─── list_approved_events: +is_society_event ────────────────────────
-- Recreated verbatim from 20260530000002 with the new column added to
-- the return table and select list. Masking logic unchanged.
-- The return-table shape changed (new column), and CREATE OR REPLACE
-- cannot change a function's return type — so DROP first. Safe: nothing
-- in the DB depends on it (the app calls it at runtime via supabase.rpc).
drop function if exists public.list_approved_events();

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
  order by e.event_at asc;
$$;
grant execute on function public.list_approved_events() to authenticated;

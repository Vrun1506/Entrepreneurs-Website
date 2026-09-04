-- ════════════════════════════════════════════════════════════════════
-- Foundry · Committee membership
--
-- Two new columns on profiles: is_committee (the flag) and committee_role
-- (the text an admin sets alongside it, e.g. "President" — shown as a gold
-- banner on the member's photo everywhere it renders). committee_role is
-- only meaningful when is_committee is true, hence the check constraint.
--
-- A committee member is escalated from the ordinary membership via
-- admin_set_committee, not signed up as one — everyone joins as a normal
-- member first, per the requester. Once escalated, list_directory_cards
-- excludes them: the general directory and the "newest members" strip are
-- not where they're meant to be found any more, list_committee_cards is.
-- admin_list_profiles is untouched by that exclusion — admins still need
-- to find and manage committee members like anyone else.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists is_committee boolean not null default false,
  add column if not exists committee_role text;

alter table public.profiles
  add constraint committee_role_requires_flag
  check (committee_role is null or is_committee);

alter table public.profiles
  add constraint committee_role_length
  check (committee_role is null or length(committee_role) <= 60);

-- ─── Exclude committee members from the general directory ────────────
-- Return type is unchanged, so create or replace is enough.
create or replace function public.list_directory_cards(
  p_query    text     default null,
  p_roles    text[]   default null,
  p_courses  text[]   default null,
  p_sectors  text[]   default null,
  p_skills   text[]   default null,
  p_grad_min int      default null,
  p_grad_max int      default null,
  p_limit    int      default 48,
  p_offset   int      default 0,
  p_sort     text     default 'name'
)
returns table (
  id           uuid,
  first_name   text,
  surname      text,
  role         public.user_role,
  course       text,
  grad_year    smallint,
  avatar_path  text,
  bio_focus    text,
  bio_hobbies  text,
  created_at   timestamptz,
  skill_names  text[],
  sector_names text[],
  total_count  bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with matched as (
    select p.*
      from public.profiles p
     where p.status = 'approved'
       and not p.is_committee
       and (public.is_approved() or public.is_admin())
       and (p_roles    is null or p.role::text = any(p_roles))
       and (p_courses  is null or p.course     = any(p_courses))
       and (p_grad_min is null or (p.grad_year is not null and p.grad_year >= p_grad_min))
       and (p_grad_max is null or (p.grad_year is not null and p.grad_year <= p_grad_max))
       and (
         p_query is null or p_query = '' or
         (p.first_name || ' ' || p.surname) ilike '%' || p_query || '%' or
         p.course       ilike '%' || p_query || '%' or
         p.bio_focus     ilike '%' || p_query || '%' or
         p.bio_hobbies   ilike '%' || p_query || '%' or
         p.working_on   ilike '%' || p_query || '%' or
         exists (
           select 1 from public.profile_skills ps
             join public.skills s on s.id = ps.skill_id
            where ps.profile_id = p.id and s.name ilike '%' || p_query || '%'
         ) or
         exists (
           select 1 from public.profile_sectors psc
             join public.sectors sc on sc.id = psc.sector_id
            where psc.profile_id = p.id and sc.name ilike '%' || p_query || '%'
         )
       )
       and (
         p_sectors is null or exists (
           select 1 from public.profile_sectors psc
             join public.sectors sc on sc.id = psc.sector_id
            where psc.profile_id = p.id and sc.name = any(p_sectors)
         )
       )
       and (
         p_skills is null or exists (
           select 1 from public.profile_skills ps
             join public.skills s on s.id = ps.skill_id
            where ps.profile_id = p.id and s.name = any(p_skills)
         )
       )
  ),
  counted as (
    select m.*, count(*) over () as total_count from matched m
  ),
  page as (
    select * from counted
     order by
       case when p_sort = 'recent' then created_at end desc nulls last,
       case when p_sort = 'recent' then null else first_name end asc,
       case when p_sort = 'recent' then null else surname end asc,
       id
     limit greatest(1, least(coalesce(p_limit, 48), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    pg.id, pg.first_name, pg.surname, pg.role, pg.course, pg.grad_year,
    pg.avatar_path,
    left(coalesce(pg.bio_focus, pg.working_on), 160),
    left(pg.bio_hobbies, 160),
    pg.created_at,
    coalesce((
      select array_agg(s.name order by s.name)
      from public.profile_skills ps
      join public.skills s on s.id = ps.skill_id
      where ps.profile_id = pg.id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(sc.name order by sc.name)
      from public.profile_sectors psc
      join public.sectors sc on sc.id = psc.sector_id
      where psc.profile_id = pg.id
    ), ARRAY[]::text[]),
    pg.total_count
  from page pg;
$$;

revoke execute on function public.list_directory_cards(
  text, text[], text[], text[], text[], int, int, int, int, text
) from public, anon;
grant execute on function public.list_directory_cards(
  text, text[], text[], text[], text[], int, int, int, int, text
) to authenticated;

-- ─── The committee gallery ─────────────────────────────────────────
-- Small and unpaged — a committee is a few dozen people at most, not
-- a thousand-row directory. Same visibility gate as list_directory_cards
-- (approved member or admin); lookingFor is intentionally not joined
-- here, unlike the directory — the gallery is a "who's on committee"
-- view, not a hiring one.
create or replace function public.list_committee_cards()
returns table (
  id             uuid,
  first_name     text,
  surname        text,
  role           public.user_role,
  course         text,
  grad_year      smallint,
  avatar_path    text,
  bio_focus      text,
  bio_hobbies    text,
  committee_role text,
  skill_names    text[],
  sector_names   text[]
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id, p.first_name, p.surname, p.role, p.course, p.grad_year,
    p.avatar_path,
    left(coalesce(p.bio_focus, p.working_on), 160),
    left(p.bio_hobbies, 160),
    p.committee_role,
    coalesce((
      select array_agg(s.name order by s.name)
      from public.profile_skills ps
      join public.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(sc.name order by sc.name)
      from public.profile_sectors psc
      join public.sectors sc on sc.id = psc.sector_id
      where psc.profile_id = p.id
    ), ARRAY[]::text[])
  from public.profiles p
  where p.status = 'approved'
    and p.is_committee
    and (public.is_approved() or public.is_admin())
  order by p.first_name, p.surname, p.id;
$$;

revoke execute on function public.list_committee_cards() from public, anon;
grant execute on function public.list_committee_cards() to authenticated;

-- ─── Admin: escalate/edit/revert committee status ─────────────────
-- Setting is_committee false always clears committee_role with it —
-- otherwise a revert-then-reescalate cycle could resurrect a stale title
-- the admin never re-entered. Enforced here, not just in the client, for
-- the same reason every other admin RPC in this file re-checks is_admin()
-- rather than trusting the caller.
create or replace function public.admin_set_committee(
  p_member_id     uuid,
  p_is_committee  boolean,
  p_committee_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_is_committee and coalesce(trim(p_committee_role), '') = '' then
    raise exception 'A committee role is required' using errcode = '22023';
  end if;

  update public.profiles
     set is_committee   = p_is_committee,
         committee_role = case when p_is_committee then trim(p_committee_role) else null end
   where id = p_member_id;

  if not found then
    raise exception 'Member not found' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.admin_set_committee(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_committee(uuid, boolean, text) to authenticated;

-- ─── admin_list_profiles: expose committee status to /admin/members ──
-- Return type gains two columns, so this is a drop + create, not a
-- create or replace — same rule as 20260901000007.
drop function if exists public.admin_list_profiles(
  text, text[], text[], text[], text[], text[], int, int, int, int
);

create or replace function public.admin_list_profiles(
  p_query    text     default null,
  p_roles    text[]   default null,
  p_statuses text[]   default null,
  p_courses  text[]   default null,
  p_sectors  text[]   default null,
  p_skills   text[]   default null,
  p_grad_min int      default null,
  p_grad_max int      default null,
  p_limit    int      default 50,
  p_offset   int      default 0
)
returns table (
  id             uuid,
  first_name     text,
  surname        text,
  role           public.user_role,
  status         public.user_status,
  course         text,
  grad_year      int,
  email          text,
  is_committee   boolean,
  committee_role text,
  created_at     timestamptz,
  skill_names    text[],
  sector_names   text[],
  total_count    bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  return query
  with matched as (
    select p.*, au.email::text as signup_email
      from public.profiles p
      -- left join: a profile row exists from the moment of signup, but a
      -- deleted auth user would leave one briefly orphaned. An admin
      -- looking for exactly that must still see the row.
      left join auth.users au on au.id = p.id
     where (p_roles    is null or p.role::text   = any(p_roles))
       and (p_statuses is null or p.status::text = any(p_statuses))
       and (p_courses  is null or p.course       = any(p_courses))
       and (p_grad_min is null or (p.grad_year is not null and p.grad_year >= p_grad_min))
       and (p_grad_max is null or (p.grad_year is not null and p.grad_year <= p_grad_max))
       and (
         p_query is null or p_query = '' or
         (p.first_name || ' ' || p.surname) ilike '%' || p_query || '%' or
         p.course     ilike '%' || p_query || '%' or
         p.working_on ilike '%' || p_query || '%' or
         -- Admins search by email; members can't and the directory RPC
         -- deliberately doesn't expose it.
         au.email::text ilike '%' || p_query || '%' or
         exists (
           select 1 from public.profile_skills ps
             join public.skills s on s.id = ps.skill_id
            where ps.profile_id = p.id and s.name ilike '%' || p_query || '%'
         ) or
         exists (
           select 1 from public.profile_sectors psc
             join public.sectors sc on sc.id = psc.sector_id
            where psc.profile_id = p.id and sc.name ilike '%' || p_query || '%'
         )
       )
       and (
         p_sectors is null or exists (
           select 1 from public.profile_sectors psc
             join public.sectors sc on sc.id = psc.sector_id
            where psc.profile_id = p.id and sc.name = any(p_sectors)
         )
       )
       and (
         p_skills is null or exists (
           select 1 from public.profile_skills ps
             join public.skills s on s.id = ps.skill_id
            where ps.profile_id = p.id and s.name = any(p_skills)
         )
       )
  ),
  counted as (
    select m.*, count(*) over () as n from matched m
  ),
  page as (
    select * from counted
     order by counted.created_at desc, counted.id
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    pg.id, pg.first_name, pg.surname, pg.role, pg.status,
    pg.course, pg.grad_year, pg.signup_email,
    pg.is_committee, pg.committee_role,
    pg.created_at,
    coalesce((
      select array_agg(s.name order by s.name)
      from public.profile_skills ps
      join public.skills s on s.id = ps.skill_id
      where ps.profile_id = pg.id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(sc.name order by sc.name)
      from public.profile_sectors psc
      join public.sectors sc on sc.id = psc.sector_id
      where psc.profile_id = pg.id
    ), ARRAY[]::text[]),
    pg.n
  from page pg;
end;
$$;

grant execute on function public.admin_list_profiles(
  text, text[], text[], text[], text[], text[], int, int, int, int
) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Directory reads: avatar_path, and the bio_focus cutover
--
-- THE GAP THAT WOULD HAVE SHIPPED BLANK MEMBER CARDS. The rebuilt
-- intake writes bio_focus/bio_hobbies (20260828000003); this function
-- still reads bio/working_on. Every member who completes the new
-- intake would get a directory card and a dialog rendering nothing.
--
-- coalesce(bio_focus, working_on) rather than trusting the one-time
-- backfill in 20260828000003 alone: a member who joined between that
-- migration landing (2026-08-28) and this one (2026-09-01) went
-- through the OLD submit_onboarding/update_profile, which wrote
-- working_on/bio but never touched bio_focus — that row's bio_focus is
-- still null today. The coalesce in the READ path covers that window;
-- the backfill alone does not.
--
-- avatar_path is added to the return type, which is why this is a
-- DROP + CREATE rather than CREATE OR REPLACE — adding an output
-- column changes the return type, the same rule as changing the
-- parameter list.
--
-- Two overloads exist today: the original 0-arg (20260826000002) and
-- the current 11-arg paginated one (20260826000003). The 0-arg is dead
-- — nothing calls it — and is dropped here rather than left to rot.
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.list_directory_cards();
drop function if exists public.list_directory_cards(
  text, text[], text[], text[], text[], int, int, int, int, text
);

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
  -- Renamed from the old bio/working_on (was: personal bio + current
  -- project, two unrelated ideas under confusing names). bio_focus is
  -- "what you're working on, or into"; bio_hobbies is new — there is
  -- no legacy column for it, so it has no fallback.
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

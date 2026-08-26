-- ════════════════════════════════════════════════════════════════════
-- Foundry · Filter and paginate the directory in Postgres
--
-- Two problems, one fix.
--
-- 1. CORRECTNESS. PostgREST caps every response at `max_rows` (1000 in
--    supabase/config.toml). The directory selected every approved
--    profile, so at 1,000 members it silently returned 1,000 and stopped
--    — no error, no indication, members simply invisible. Verified by
--    seeding 1,203: the page rendered exactly 1,000. Raising the cap only
--    moves the cliff, so the fix is to stop asking for unbounded results.
--
-- 2. PAYLOAD. Even trimmed to card fields (migration 20260826000002), all
--    1,203 rows are ~750 kB of JSON, which Next serialises twice — once
--    into the HTML and once into the RSC payload — for ~1.9 MB over the
--    wire per navigation. A page of 48 is ~26 kB.
--
-- Filtering has to move with pagination: the client derived its filter
-- chips and its search from the full array, and neither works once it
-- only holds one page. So list_directory_cards takes the filters, and
-- list_directory_facets supplies the chip values separately.
--
-- NOTE ON THE DROP BELOW. Adding parameters to a `create or replace`
-- makes an *overload*, leaving the old zero-argument version in place for
-- PostgREST to pick — the dead-overload trap this codebase has hit before
-- and which rls_smoke test 18 guards against. The old signature is
-- dropped explicitly.
-- ════════════════════════════════════════════════════════════════════

-- Drop every existing signature by name rather than naming one. The
-- previous version took no arguments; naming a signature here means a
-- future parameter change silently leaves an overload behind, which is the
-- failure this comment exists to prevent.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.proname = 'list_directory_cards'
  loop
    execute format('drop function %s', r.sig);
  end loop;
end;
$$;

-- ─── Indexes for the ordered, filtered scan ─────────────────────────
-- The list is ordered by created_at desc within status='approved'; the
-- existing profiles_status_idx can't serve the ordering.
create index if not exists profiles_status_created_idx
  on public.profiles (status, created_at desc);

-- Search matches names, course and working_on with ILIKE. Trigram GIN
-- turns those into index scans instead of a full scan per keystroke.
create extension if not exists pg_trgm;

create index if not exists profiles_name_trgm_idx
  on public.profiles using gin ((first_name || ' ' || surname) gin_trgm_ops);
create index if not exists profiles_course_trgm_idx
  on public.profiles using gin (course gin_trgm_ops);
create index if not exists profiles_working_on_trgm_idx
  on public.profiles using gin (working_on gin_trgm_ops);

-- The skill/sector filters probe by profile; the existing indexes are on
-- the *other* column of each junction table.
create index if not exists profile_skills_profile_idx
  on public.profile_skills (profile_id);
create index if not exists profile_sectors_profile_idx
  on public.profile_sectors (profile_id);

-- ─── The paginated, filtered directory ──────────────────────────────
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
  -- 'name' for the directory grid, 'recent' for the "newest members" strip.
  -- The strip used to be the first 5 of the fully-loaded array; with only a
  -- page in hand the client can no longer work it out for itself.
  p_sort     text     default 'name'
)
returns table (
  id           uuid,
  first_name   text,
  surname      text,
  role         public.user_role,
  course       text,
  grad_year    smallint,
  bio          text,
  working_on   text,
  created_at   timestamptz,
  skill_names  text[],
  sector_names text[],
  -- Total matching rows, repeated on every row via a window function so
  -- the caller gets the count without a second query. The client needs it
  -- to render "N of M" and the pager.
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
       -- Same gate the RLS policy applies. SECURITY DEFINER bypasses RLS,
       -- so this is the check, not a duplicate of one.
       and (public.is_approved() or public.is_admin())
       and (p_roles    is null or p.role::text = any(p_roles))
       and (p_courses  is null or p.course     = any(p_courses))
       and (p_grad_min is null or (p.grad_year is not null and p.grad_year >= p_grad_min))
       and (p_grad_max is null or (p.grad_year is not null and p.grad_year <= p_grad_max))
       and (
         p_query is null or p_query = '' or
         (p.first_name || ' ' || p.surname) ilike '%' || p_query || '%' or
         p.course     ilike '%' || p_query || '%' or
         p.working_on ilike '%' || p_query || '%' or
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
    -- Sorting in SQL rather than in the client is now required, not a
    -- preference: the client only ever sees one page.
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
    left(pg.bio, 160),
    left(pg.working_on, 100),
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

grant execute on function public.list_directory_cards(
  text, text[], text[], text[], text[], int, int, int, int, text
) to authenticated;

-- ─── Filter chip values ─────────────────────────────────────────────
-- Derived from every approved member, not from the current page — the
-- chips must offer everything that exists, not just what happens to be on
-- screen. Small and identical for every member, so it caches well.
create or replace function public.list_directory_facets()
returns table (
  courses  text[],
  sectors  text[],
  skills   text[],
  grad_min int,
  grad_max int,
  total    bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce((
      select array_agg(distinct p.course order by p.course)
      from public.profiles p
      where p.status = 'approved' and p.course is not null and length(trim(p.course)) > 0
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(distinct s.name order by s.name)
      from public.profile_sectors psc
      join public.sectors s on s.id = psc.sector_id
      join public.profiles p on p.id = psc.profile_id
      where p.status = 'approved'
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(distinct s.name order by s.name)
      from public.profile_skills ps
      join public.skills s on s.id = ps.skill_id
      join public.profiles p on p.id = ps.profile_id
      where p.status = 'approved'
    ), ARRAY[]::text[]),
    (select min(grad_year)::int from public.profiles where status = 'approved' and grad_year is not null),
    (select max(grad_year)::int from public.profiles where status = 'approved' and grad_year is not null),
    (select count(*) from public.profiles where status = 'approved')
  where public.is_approved() or public.is_admin();
$$;

grant execute on function public.list_directory_facets() to authenticated;

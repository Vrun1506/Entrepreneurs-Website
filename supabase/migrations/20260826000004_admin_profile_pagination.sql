-- ════════════════════════════════════════════════════════════════════
-- Foundry · Filter and paginate the two admin profile pages
--
-- Migration 20260826000003 fixed the member-facing directory. These two
-- pages have the identical bug and are strictly worse, because they are
-- the pages an admin would use to *find* the member who has gone missing:
--
--   app/admin/members/page.tsx  select every profile, no bound
--   app/admin/users/page.tsx      select every pending_review profile
--
-- PostgREST caps each response at max_rows (1000, supabase/config.toml)
-- and reports no error when it does. At 1,001 members /admin/members
-- renders "1000 total" and member 1,001 cannot be found by any search or
-- filter on that page. Nothing indicates the list is incomplete.
--
-- /admin/members compounds it one line further down: it feeds the
-- truncated id list into admin_get_signup_emails, so the emails are cut
-- to match. Two silent truncations, one visible symptom — none.
--
-- Both functions here return rows AND a total via a window function, so
-- the caller can render "N of M" and a pager without a second query.
-- Both are gated on is_admin(); SECURITY DEFINER bypasses RLS, so that
-- check is the gate, not a restatement of one.
--
-- admin_list_profiles returns the signup email itself rather than leaving
-- the caller to batch a second lookup. That removes the coupled
-- truncation above, and one round trip.
-- ════════════════════════════════════════════════════════════════════

-- Ordering for both queues. The community list is created_at desc; the
-- review queue is created_at asc within status='pending_review'. Postgres
-- scans a btree in either direction, so profiles_status_created_idx
-- (added in 20260826000003) serves both.

-- Drop any existing signature of each function by NAME rather than by a
-- named signature. Two reasons, both learned the hard way in this repo:
--
--   * `create or replace` cannot change a function's return type, so this
--     file is not re-runnable without it — and these migrations are applied
--     by hand, where re-running a file is normal.
--   * Naming one signature means a later parameter change silently leaves
--     the old function behind as an overload for PostgREST to pick. That is
--     the dead-overload trap rls_smoke test 18 exists to catch.
--
-- On a database that has never seen these functions, this is a no-op.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     where p.proname in (
       'admin_list_profiles', 'admin_profile_facets', 'admin_list_pending_profiles'
     )
  loop
    execute format('drop function %s', r.sig);
  end loop;
end;
$$;

-- ─── /admin/members: every profile, filtered and paged ────────────
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
  id           uuid,
  first_name   text,
  surname      text,
  role         public.user_role,
  status       public.user_status,
  course       text,
  grad_year    int,
  email        text,
  created_at   timestamptz,
  skill_names  text[],
  sector_names text[],
  total_count  bigint
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
    pg.course, pg.grad_year, pg.signup_email, pg.created_at,
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

-- ─── Filter chip values for /admin/members ────────────────────────
-- Distinct from list_directory_facets: that one is scoped to approved
-- members, and this page's whole purpose is the ones who aren't. Both
-- exist because they answer different questions, not by duplication.
create or replace function public.admin_profile_facets()
returns table (
  courses  text[],
  sectors  text[],
  skills   text[],
  grad_min int,
  grad_max int,
  total    bigint
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
  select
    coalesce((
      select array_agg(distinct p.course order by p.course)
      from public.profiles p
      where p.course is not null and length(trim(p.course)) > 0
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(distinct s.name order by s.name)
      from public.profile_sectors psc
      join public.sectors s on s.id = psc.sector_id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(distinct s.name order by s.name)
      from public.profile_skills ps
      join public.skills s on s.id = ps.skill_id
    ), ARRAY[]::text[]),
    (select min(p.grad_year)::int from public.profiles p where p.grad_year is not null),
    (select max(p.grad_year)::int from public.profiles p where p.grad_year is not null),
    (select count(*) from public.profiles);
end;
$$;

grant execute on function public.admin_profile_facets() to authenticated;

-- ─── /admin/users: the alumni review queue, paged ───────────────────
-- Oldest first: this is a queue, and the person who has waited longest
-- should be reviewed first. Returns the full review card — bio,
-- working_on and the three URLs — because an admin cannot decide without
-- them. That payload is exactly why the page needs a bound: it is the
-- heaviest per-row shape in the app.
create or replace function public.admin_list_pending_profiles(
  p_limit  int default 25,
  p_offset int default 0
)
returns table (
  id            uuid,
  first_name    text,
  surname       text,
  role          public.user_role,
  course        text,
  grad_year     int,
  bio           text,
  working_on    text,
  linkedin_url  text,
  github_url    text,
  portfolio_url text,
  email         text,
  created_at    timestamptz,
  skill_names   text[],
  sector_names  text[],
  total_count   bigint
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
  with counted as (
    select p.*, au.email::text as signup_email, count(*) over () as n
      from public.profiles p
      left join auth.users au on au.id = p.id
     where p.status = 'pending_review'
  ),
  page as (
    select * from counted
     order by counted.created_at asc, counted.id
     limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    pg.id, pg.first_name, pg.surname, pg.role, pg.course, pg.grad_year,
    pg.bio, pg.working_on, pg.linkedin_url, pg.github_url, pg.portfolio_url,
    pg.signup_email, pg.created_at,
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

grant execute on function public.admin_list_pending_profiles(int, int) to authenticated;

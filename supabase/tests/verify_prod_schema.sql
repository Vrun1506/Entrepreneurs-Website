-- ════════════════════════════════════════════════════════════════════
-- Foundry · Production schema verification (READ-ONLY)
--
-- Run in the Supabase SQL editor against PROD after applying migrations.
-- It performs NO writes. It RAISES EXCEPTION on the first broken invariant
-- (so a clean run = everything below held), then prints a snapshot to eyeball.
--
-- Safe to re-run anytime. Covers the security-critical invariants that, if
-- silently drifted, would mean a real hole: dead RPC overloads, the role/
-- status/email-domain/society-flag protection triggers, RLS coverage, and
-- SECURITY DEFINER on the privileged RPCs.
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  v_bad   text;
  v_n     int;
begin
  -- 1. No dead overloads. A CREATE OR REPLACE with a drifted signature makes
  --    a SECOND function; supabase-js .rpc() then can't disambiguate. Exclude
  --    extension-owned functions (deptype 'e').
  select string_agg(p.proname || ' (' || c || ')', ', ')
    into v_bad
  from (
    select p.oid, p.proname, count(*) over (partition by p.proname) as c
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  ) p
  where p.c > 1;
  if v_bad is not null then
    raise exception 'DEAD OVERLOAD(S): %', v_bad;
  end if;
  raise notice 'OK  1  no duplicate function overloads in public';

  -- 2. Security-critical triggers present (one row each, on the right table).
  for v_bad in
    select x.want
    from (values
      ('profiles',     'profiles_protect_role'),
      ('profiles',     'profiles_protect_status'),
      ('events',       'events_protect_society_flag'),
      ('events',       'events_protect_status'),
      ('opportunities','opportunities_protect_status'),
      ('vcs_grants',   'vcs_grants_protect_status')
    ) as x(tbl, want)
    where not exists (
      select 1 from pg_trigger t
      join pg_class c   on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = x.tbl
        and t.tgname  = x.want
        and not t.tgisinternal
    )
  loop
    raise exception 'MISSING TRIGGER: %', v_bad;
  end loop;
  raise notice 'OK  2  role/status/society-flag protection triggers present';

  -- 2b. Email-domain lock on auth.users (Imperial re-check on email change).
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
      and t.tgname = 'on_auth_user_email_change' and not t.tgisinternal
  ) then
    raise exception 'MISSING TRIGGER: auth.users on_auth_user_email_change';
  end if;
  raise notice 'OK  2b on_auth_user_email_change present on auth.users';

  -- 3. Signature integrity for the two RPCs whose arg lists changed last:
  --    submit_onboarding = 9 args, update_profile = 11 args. Wrong count =
  --    either a drifted overload or the wrong migration applied.
  select pronargs into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_onboarding';
  if v_n is distinct from 9 then
    raise exception 'submit_onboarding has % args, expected 9', coalesce(v_n::text,'NONE');
  end if;
  select pronargs into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_profile';
  if v_n is distinct from 11 then
    raise exception 'update_profile has % args, expected 11', coalesce(v_n::text,'NONE');
  end if;
  raise notice 'OK  3  submit_onboarding(9) + update_profile(11) signatures intact';

  -- 4. RLS enabled on every base table in public (no table silently world-open).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'RLS DISABLED on: %', v_bad;
  end if;
  raise notice 'OK  4  RLS enabled on all public base tables';

  -- 4b. Every RLS-enabled table has at least one policy (RLS with zero policies
  --     = locked shut for non-owners; usually a mistake unless intended).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if v_bad is not null then
    raise notice 'WARN 4b RLS on but NO policy (intended?): %', v_bad;
  else
    raise notice 'OK  4b every RLS table has >=1 policy';
  end if;

  -- 5. SECURITY DEFINER on the privileged RPCs (they bypass RLS by design;
  --    if one lost prosecdef it would run as the caller and break/leak).
  for v_bad in
    select want from (values
      ('submit_onboarding'),('update_profile'),('approve_user'),('reject_user'),
      ('delete_my_account'),('admin_create_event'),('admin_create_opportunity'),
      ('admin_create_vc_grant'),('enqueue_outbound_email'),('claim_outbound_email_batch'),
      -- Paginated list RPCs (20260826000003/4). These are how the directory
      -- and the two admin profile pages avoid PostgREST's silent 1000-row
      -- truncation; if one is missing, the page it backs is broken, and if
      -- one lost prosecdef the auth.users join in it would fail outright.
      ('list_directory_cards'),('list_directory_facets'),
      ('admin_list_profiles'),('admin_profile_facets'),('admin_list_pending_profiles')
    ) as x(want)
    where not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = x.want and p.prosecdef
    )
  loop
    raise exception 'NOT SECURITY DEFINER (or missing): %', v_bad;
  end loop;
  raise notice 'OK  5  privileged RPCs are SECURITY DEFINER';

  -- 6. Society-flag column shipped by 20260603000002.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name = 'is_society_event'
  ) then
    raise exception 'events.is_society_event column missing';
  end if;
  raise notice 'OK  6  events.is_society_event present';

  raise notice '─── ALL ASSERTIONS PASSED ───';
end $$;

-- ──────────────────────────────────────────────────────────────────────
-- Snapshot to eyeball (counts should look sane; no assertion here)
-- ──────────────────────────────────────────────────────────────────────

-- Function inventory + overload count per name.
select p.proname,
       count(*)                                   as overloads,
       bool_and(p.prosecdef)                      as security_definer,
       string_agg(p.pronargs::text, '/' order by p.pronargs) as arg_counts
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
group by p.proname
order by p.proname;

-- Per-table: RLS flag + policy count.
select c.relname                                  as table_name,
       c.relrowsecurity                           as rls_enabled,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- User-defined triggers per table (excludes internal FK/constraint triggers).
select c.relname as table_name, t.tgname as trigger_name
from pg_trigger t
join pg_class c   on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','auth') and not t.tgisinternal
order by c.relname, t.tgname;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Clear the pilot down to a single admin account
--
-- RUN IN THE SUPABASE SQL EDITOR, AGAINST PRODUCTION.
-- Section 1 is READ-ONLY. Section 2 DELETES. Section 3 verifies.
--
-- Context: the 28 accounts in production are a committee pilot, not
-- public members. This clears them so launch starts from a known state,
-- keeping exactly one account:
--
--     imperial.founders@gmail.com
--
-- ──────────────────────────────────────────────────────────────────────
-- ⚠ TAKE A BACKUP FIRST — Dashboard → Database → Backups
-- ──────────────────────────────────────────────────────────────────────
-- Nothing below is recoverable. The transaction is all-or-nothing, which
-- protects you from a HALF-cleared database, not from a cleared one.
--
-- RUN THIS BEFORE THE 20260828 MIGRATIONS, not after. The migrations then
-- apply to an essentially empty table, and complete_admin_profiles.sql is
-- left with exactly one row to fill in.
--
-- ──────────────────────────────────────────────────────────────────────
-- WHY THE ORDER BELOW IS NOT NEGOTIABLE
-- ──────────────────────────────────────────────────────────────────────
--
--   profiles.id            → auth.users    ON DELETE CASCADE
--   events.posted_by       → profiles      ON DELETE RESTRICT
--   opportunities.posted_by→ profiles      ON DELETE RESTRICT
--   vcs_grants.posted_by   → profiles      ON DELETE RESTRICT
--   admin_actions.admin_id → auth.users    ON DELETE RESTRICT
--
-- So `delete from auth.users` does NOT simply cascade. It tries to remove
-- the profile, hits RESTRICT from any listing that person posted, and the
-- whole statement fails. The listings and the audit rows have to go first.
--
-- KEPT DELIBERATELY: skills, sectors, app_config. That is reference data
-- and taxonomy — the app is broken without it, and it holds no personal
-- data.
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. PREFLIGHT — read this before running section 2 ───────────────
-- Confirms the account you are keeping actually exists and is an admin,
-- and shows the size of what is about to be destroyed.
select 'KEEPING' as scope, u.id::text as detail, u.email as value
  from auth.users u where lower(u.email) = 'imperial.founders@gmail.com'
union all
select 'KEEPING · is in admins table',
       (exists (select 1 from public.admins a
                 join auth.users u on u.id = a.user_id
                where lower(u.email) = 'imperial.founders@gmail.com'))::text, ''
union all
select 'KEEPING · profile status',
       coalesce((select p.status::text from public.profiles p
                  join auth.users u on u.id = p.id
                 where lower(u.email) = 'imperial.founders@gmail.com'), 'NO PROFILE ROW'), ''
union all
select 'DELETING · auth users',   count(*)::text, '' from auth.users
  where lower(email) <> 'imperial.founders@gmail.com'
union all
select 'DELETING · profiles',     count(*)::text, '' from public.profiles p
  join auth.users u on u.id = p.id where lower(u.email) <> 'imperial.founders@gmail.com'
union all
select 'DELETING · events',        count(*)::text, '' from public.events
union all
select 'DELETING · opportunities', count(*)::text, '' from public.opportunities
union all
select 'DELETING · vcs_grants',    count(*)::text, '' from public.vcs_grants
union all
select 'DELETING · admin_actions', count(*)::text, '' from public.admin_actions
union all
select 'DELETING · outbound_email',count(*)::text, '' from public.outbound_email
union all
select 'KEEPING · skills',         count(*)::text, '' from public.skills
union all
select 'KEEPING · sectors',        count(*)::text, '' from public.sectors;


-- ════════════════════════════════════════════════════════════════════
-- 2. THE CLEAR-DOWN. Destructive. Run as ONE statement.
--
-- Wrapped in a DO block so it is a single transaction: if any step
-- fails, every step rolls back and you are left where you started
-- rather than half-cleared.
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  v_keep_email constant text := 'imperial.founders@gmail.com';
  v_keep_id    uuid;
  v_n          int;
begin
  -- The trigger-guarded columns and the admin RPCs read auth.role(). The
  -- SQL editor carries no JWT, so it is set here. Transaction-local.
  perform set_config('request.jwt.claims',
    json_build_object('role','service_role')::text, true);

  -- ── The guard that makes this safe to run ──────────────────────────
  -- If the address is wrong or absent, this aborts BEFORE deleting
  -- anything, rather than clearing the database down to nobody.
  select id into v_keep_id from auth.users where lower(email) = v_keep_email;
  if v_keep_id is null then
    raise exception 'ABORT: no account found for % — nothing deleted', v_keep_email;
  end if;
  if (select count(*) from auth.users where lower(email) = v_keep_email) > 1 then
    raise exception 'ABORT: % is not unique — nothing deleted', v_keep_email;
  end if;
  raise notice 'keeping % (%)', v_keep_email, v_keep_id;

  -- ── Operational + engagement tables ────────────────────────────────
  -- No FK blocks these, and they reference rows that are about to vanish.
  delete from public.outbound_email;        get diagnostics v_n = row_count;
    raise notice 'deleted % outbound_email', v_n;
  delete from public.listing_events;        get diagnostics v_n = row_count;
    raise notice 'deleted % listing_events', v_n;
  delete from public.user_listing_actions;  get diagnostics v_n = row_count;
    raise notice 'deleted % user_listing_actions', v_n;
  delete from public.opportunity_bookmarks; get diagnostics v_n = row_count;
    raise notice 'deleted % opportunity_bookmarks', v_n;
  delete from public.email_change_log;      get diagnostics v_n = row_count;
    raise notice 'deleted % email_change_log', v_n;

  -- admin_actions.admin_id is RESTRICT against auth.users. Clearing it
  -- here is what lets any non-surviving admin be removed below.
  delete from public.admin_actions;         get diagnostics v_n = row_count;
    raise notice 'deleted % admin_actions', v_n;

  -- ── Listings ───────────────────────────────────────────────────────
  -- MUST precede the profile deletion: posted_by is RESTRICT, so a single
  -- listing left behind blocks its author's removal and fails the lot.
  -- opportunity_skills / opportunity_sectors cascade from opportunities.
  delete from public.events;                get diagnostics v_n = row_count;
    raise notice 'deleted % events', v_n;
  delete from public.opportunities;         get diagnostics v_n = row_count;
    raise notice 'deleted % opportunities', v_n;
  delete from public.vcs_grants;            get diagnostics v_n = row_count;
    raise notice 'deleted % vcs_grants', v_n;

  -- ── The accounts ───────────────────────────────────────────────────
  -- profiles, profile_skills, profile_sectors, admins and the auth-schema
  -- rows (identities, sessions, one_time_tokens) all cascade from here.
  delete from auth.users where id <> v_keep_id;
  get diagnostics v_n = row_count;
  raise notice 'deleted % auth users', v_n;

  -- ── Post-conditions, checked before the transaction is allowed to end ─
  if not exists (select 1 from auth.users where id = v_keep_id) then
    raise exception 'ABORT: the account being kept was deleted — rolling back';
  end if;
  if not exists (select 1 from public.admins where user_id = v_keep_id) then
    raise exception 'ABORT: % is no longer in the admins table — rolling back', v_keep_email;
  end if;
  if (select count(*) from auth.users) <> 1 then
    raise exception 'ABORT: expected exactly 1 account, found % — rolling back',
      (select count(*) from auth.users);
  end if;
  if (select count(*) from public.skills) = 0
     or (select count(*) from public.sectors) = 0 then
    raise exception 'ABORT: taxonomy was emptied — rolling back';
  end if;

  raise notice 'done — database cleared to % only', v_keep_email;
end;
$$;


-- ─── 3. VERIFY ───────────────────────────────────────────────────────
select 'auth users'    as table_name, count(*)::text as rows from auth.users
union all select 'profiles',      count(*)::text from public.profiles
union all select 'admins',        count(*)::text from public.admins
union all select 'events',        count(*)::text from public.events
union all select 'opportunities', count(*)::text from public.opportunities
union all select 'vcs_grants',    count(*)::text from public.vcs_grants
union all select 'skills (kept)',  count(*)::text from public.skills
union all select 'sectors (kept)', count(*)::text from public.sectors
union all select 'surviving email',
  coalesce((select email from auth.users limit 1), '— NONE —');

-- ─── Take `anon` off the admin RPCs ─────────────────────────────────
-- Capacity/security review 2026-08-27. Closes the half of the boundary
-- that migration 20260608000001 left open.
--
-- That migration established the rule this project works to: on Supabase
-- the real authz boundary for a function is BOTH a named-role revoke AND
-- an in-body check, because `revoke ... from public` is a no-op while
-- `anon` and `authenticated` hold their own direct grants from Supabase's
-- default privileges. It applied that rule to internal/cron/trigger
-- functions only.
--
-- Every `admin_*` / `approve_*` / `reject_*` function — plus the two
-- admin review queues whose names put the word last — is therefore still
-- EXECUTE-able by `anon` today, with its in-body `is_admin()` as the only
-- gate. That gate is correct and does hold: `is_admin()` reads
-- `auth.uid()`, which is NULL for anon, so an unauthenticated caller gets
-- 'Admin access required', not data. This migration is not fixing a
-- disclosure. It is removing the single-check-deep posture, so that a
-- future edit which drops or weakens an in-body guard hits a closed door
-- instead of an open one.
--
-- WHY A LOOP, AND WHY BY NAME. Naming signatures here is how this silently
-- rots: `revoke execute on function public.approve_user(uuid)` matches one
-- exact argument list, so the next time an admin RPC gains a parameter the
-- revoke quietly stops applying to the function the app actually calls —
-- the same dead-overload trap that has already bitten this codebase once
-- (see 20260601000000). Resolving each function by oid at run time means
-- every overload present is covered, whatever its arguments.
--
-- `authenticated` and `service_role` are granted back explicitly rather
-- than left to Supabase's defaults, so the end state is what this file
-- says it is and not a function of which privileges happened to exist.
--
-- This does NOT stop rot on its own: a later `create or replace` re-runs
-- Supabase's default privileges and hands `anon` a fresh grant. The
-- tripwire for that is the assertion added to supabase/tests/rls_smoke.sql
-- alongside this migration, which fails CI the moment an admin RPC becomes
-- anon-callable again.

do $$
declare
  r       record;
  v_names text[] := '{}';
begin
  for r in
    select p.oid::regprocedure::text as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       -- ours only; never touch a function an extension owns
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e')
       and (
         p.proname ~ '^(admin|approve|reject)_'
         -- admin-only, but the name puts the word last
         or p.proname in ('list_pending_opportunities_admin',
                          'list_pending_events_admin')
       )
     order by p.proname
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    v_names := v_names || r.proname;
  end loop;

  -- A silent no-op here would mean the pattern stopped matching anything —
  -- a rename, a schema move — and the migration "succeeding" while locking
  -- nothing. Fail instead.
  if cardinality(v_names) = 0 then
    raise exception
      'No admin RPCs matched — the name pattern no longer selects anything, so nothing was locked';
  end if;

  raise notice 'Revoked anon EXECUTE on % admin function(s): %',
    cardinality(v_names), array_to_string(v_names, ', ');
end;
$$;

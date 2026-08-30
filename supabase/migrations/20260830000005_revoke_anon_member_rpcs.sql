-- ─── Take `anon` off the member RPCs too ────────────────────────────
-- Pre-Azure-deploy audit 2026-08-30. Closes the other half of the
-- boundary 20260608000001 and 20260827000001 left open.
--
-- 20260608000001 established the rule this project works to: on Supabase
-- the real authz boundary for a function is BOTH a named-role revoke AND
-- an in-body check, because `revoke ... from public` is a no-op while
-- `anon` and `authenticated` hold their own direct grants from Supabase's
-- default privileges. 20260827000001 applied that rule to every
-- admin-prefixed RPC. Neither ever reached the member-facing RPCs that
-- predate the community-posts feature — checked empirically against a
-- fresh reset (has_function_privilege('anon', ..., 'EXECUTE')): every one
-- of the 22 functions below is anon-executable today, while every RPC the
-- community-posts feature added (create_post, report_post, list_community_feed,
-- etc.) already correctly excludes anon — that feature was built after
-- 20260608000001 and applied its lesson going forward; this migration
-- applies it backward.
--
-- Every one of the 22 already gates in-body on `auth.uid()` (directly, or
-- through is_approved()/is_admin(), both of which read auth.uid() and are
-- NULL for anon): update_profile, submit_opportunity and the rest raise or
-- filter to nothing for an anonymous caller today. So this is not fixing a
-- disclosure — no anon request currently gets data or writes a row through
-- any of these. It removes the single-check-deep posture, the same
-- reasoning 20260827000001 gave for the admin RPCs: a future edit that
-- drops or weakens one in-body guard should hit a closed door, not an
-- open one. It also closes a live scale gap distinct from disclosure: any
-- caller holding only the public anon key — no signup, no login — can
-- invoke these directly against PostgREST today, entirely bypassing the
-- app's own Upstash rate limiting, which only wraps the Next.js server
-- actions that normally front these RPCs.
--
-- WHY A LOOP OVER A NAME LIST, AND NOT HAND-WRITTEN SIGNATURES. Resolving
-- each function by oid at run time, from a list of bare names, means an
-- argument added to e.g. submit_opportunity next month is still covered —
-- a hand-transcribed `revoke ... on function f(text, text, ...)` would
-- silently stop matching and leave the new overload anon-callable, the
-- same dead-overload trap 20260827000001 names and 20260601000000 already
-- hit once. `authenticated` and `service_role` are re-granted explicitly
-- rather than left to whatever they already had, so the end state is what
-- this file says it is.
--
-- is_admin/is_approved are deliberately NOT in this list: RLS policies
-- across the schema call them, and a policy's evaluating role needs
-- EXECUTE on the functions it calls — anon genuinely needs these two, and
-- they are pure boolean predicates with no side effect and no sensitive
-- payload, so anon holding them exposes nothing.
--
-- The tripwire for this rotting again is the assertion added to
-- supabase/tests/rls_smoke.sql alongside this migration, which fails CI
-- the moment any of these 22 (or a future addition to the list) becomes
-- anon-callable again.

do $$
declare
  r       record;
  v_names text[] := '{}';
  v_target_names text[] := array[
    'delete_my_account', 'get_event_for_edit', 'get_my_activity',
    'get_my_listing_actions', 'get_my_listing_stats', 'get_opportunity_for_edit',
    'list_approved_events', 'list_approved_opportunities',
    'list_directory_cards', 'list_directory_facets',
    'list_my_bookmarked_opportunities', 'mark_listing_action',
    'record_listing_event', 'submit_event', 'submit_onboarding',
    'submit_opportunity', 'submit_vc_grant', 'unmark_listing_action',
    'update_event', 'update_opportunity', 'update_profile', 'update_vc_grant'
  ];
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
       and p.proname = any(v_target_names)
     order by p.proname
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
    v_names := v_names || r.proname;
  end loop;

  -- A count mismatch means a name in v_target_names matched nothing (a
  -- typo, a rename this migration doesn't know about) — fail instead of
  -- silently locking fewer functions than the file claims to.
  if cardinality(v_names) <> cardinality(v_target_names) then
    raise exception
      'Expected to lock % function(s), only matched %: %. Check v_target_names against pg_proc.',
      cardinality(v_target_names), cardinality(v_names), array_to_string(v_names, ', ');
  end if;

  raise notice 'Revoked anon EXECUTE on % member function(s): %',
    cardinality(v_names), array_to_string(v_names, ', ');
end;
$$;

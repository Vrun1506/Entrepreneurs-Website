-- ════════════════════════════════════════════════════════════════════
-- Foundry · Actually lock cv_path (and friends) out of direct table reads
--
-- 20260901000003 tried to do this with a column-level REVOKE and it does
-- not work: `authenticated` and `anon` already hold table-level SELECT on
-- public.profiles (20260527000002), and in Postgres's privilege model a
-- table-level grant implies every column — a column-level REVOKE issued
-- afterward cannot narrow it. rls_smoke.sql's own §22b assertion caught
-- this: `has_column_privilege('authenticated', 'public.profiles',
-- 'cv_path', 'SELECT')` was still true after that migration ran.
--
-- The result was live: any approved member could run
-- `supabase.from('profiles').select('cv_path').eq('id', someoneElseId)`
-- directly against PostgREST and read another member's CV blob key —
-- exactly what that migration's own comment says it prevents. It didn't.
--
-- The only privilege shape that actually restricts a column in Postgres
-- is revoking the table-level SELECT and granting column-level SELECT
-- back for an explicit list. That list has to name every profiles column
-- meant to stay readable, which is why this runs last in the chain —
-- after 20260901000004 is the last migration to ALTER TABLE profiles ADD
-- COLUMN. A future column needs adding to the list below by hand; there
-- is no way to make "everything except these five" self-maintaining
-- without giving up the restriction entirely.
--
-- Only SELECT is touched. INSERT/UPDATE/DELETE stay exactly as granted —
-- profiles_insert_own / profiles_update_own / profiles_update_admin rely
-- on those table-level grants existing; RLS narrows the rows, not this.
-- Every RPC that legitimately reads cv_path (get_my_cv_info,
-- admin_get_cv_info) is SECURITY DEFINER, so it runs as the function
-- owner and is entirely unaffected by what authenticated/anon can select
-- directly — this migration only closes the raw PostgREST table path.

revoke select on public.profiles from authenticated, anon;

grant select (
  id, role, status, first_name, surname, linkedin_url, grad_year, bio, working_on,
  created_at, updated_at, github_url, course, portfolio_url, preferred_name,
  bio_focus, bio_hobbies, avatar_path, profile_version,
  current_focus, venture_stage, venture_name, venture_url, venture_one_liner,
  recruiting_status, intent_urgency, availability_hours,
  intake_completed_at, intake_deferred_at
) on public.profiles to authenticated, anon;

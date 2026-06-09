-- ─── Capture + lock the rls_auto_enable event-trigger function ──────
-- Security audit follow-up 2026-06-08.
--
-- `rls_auto_enable` is an EVENT-TRIGGER function (wired to the event
-- trigger `ensure_rls`) that auto-runs `ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY` on every CREATE TABLE in schema `public`. It is a defensive
-- guardrail and must keep firing.
--
-- It was discovered via a live `aclexplode` grant dump showing it
-- EXECUTE-able by anon/authenticated. That grant is harmless in practice
-- — a function returning `event_trigger` CANNOT be invoked directly
-- (Postgres rejects `SELECT rls_auto_enable()` and PostgREST cannot
-- expose it) — but it is untidy and it was NOT under version control
-- (it existed only in prod, created out-of-band). This migration:
--   1. captures the exact prod definition so the guardrail survives a
--      rebuild-from-migrations (it was previously invisible to the repo);
--   2. revokes the meaningless EXECUTE grant from public/anon/authenticated
--      so the public-function grant surface is fully clean and the CI
--      tripwire (supabase/tests/rls_smoke.sql) stays meaningful.
--
-- Revoking EXECUTE is zero-breakage: event triggers fire regardless of
-- whether the invoking role holds EXECUTE on the function (same as the
-- table-trigger `tg_*` functions locked in 20260608000001).
--
-- NOTE: the `ensure_rls` event trigger itself already exists in prod and
-- is intentionally NOT recreated here — its exact WHEN/tag clause is not
-- captured, and `create or replace function` leaves the existing trigger
-- binding intact. This migration only owns the function body + grant.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

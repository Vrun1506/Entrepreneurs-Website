-- ════════════════════════════════════════════════════════════════════
-- Foundry · Capture the ensure_rls event trigger
--
-- Security audit 2026-09-05 (LOW), closing the gap 20260608000002 and
-- 20260829000001 both flagged: `rls_auto_enable()` (the function) has
-- been under version control since 20260608000002, but the event
-- trigger `ensure_rls` that wires it to ddl_command_end was left
-- uncaptured — it exists only in prod, created out-of-band, and its
-- exact WHEN/tag clause was not previously known. Guessing that clause
-- would have been worse than leaving the gap open, so it stayed
-- uncaptured until it could be read directly off prod.
--
-- Read directly off the live event trigger (pg_event_trigger, 2026-09-05):
--   evtevent: ddl_command_end
--   evttags:  CREATE TABLE, CREATE TABLE AS, SELECT INTO
--   evtfoid:  rls_auto_enable
--   evtenabled: 'O' (origin) — the default CREATE EVENT TRIGGER produces
--     on its own, so no additional ALTER ... ENABLE is needed here.
--
-- This matches rls_auto_enable()'s own internal command_tag filter
-- exactly, confirming the two were never out of sync.
--
-- Postgres has no `CREATE OR REPLACE EVENT TRIGGER` and no `IF NOT
-- EXISTS` clause for it, so this is guarded explicitly: a no-op on the
-- current database (where it already exists), and the thing that
-- actually recreates it on a from-scratch rebuild.
-- ════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function public.rls_auto_enable();
  end if;
end;
$$;

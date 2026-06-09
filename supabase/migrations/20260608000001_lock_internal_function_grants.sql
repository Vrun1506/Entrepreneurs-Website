-- ─── Lock internal / cron / service-only functions ─────────────────
-- Security audit 2026-06-08 (HIGH + MEDIUM).
--
-- Root cause: on this Supabase project the `anon` and `authenticated`
-- roles hold a blanket EXECUTE grant on EVERY function in schema
-- `public` via Supabase's default privileges. So `revoke execute ...
-- from public` in earlier migrations did NOT lock anything — those two
-- roles keep their own direct grant. The only real access boundary is
-- (a) revoking from the named roles, and (b) an in-body auth check.
--
-- This migration, for every internal/cron/service-only function:
--   * revokes EXECUTE from `public, anon, authenticated` — all three,
--     because anon/authenticated hold direct grants (so revoking only
--     `public` is a no-op) AND `public` holds the system-default grant
--     (so leaving it keeps the function reachable via PUBLIC membership);
--   * adds a defence-in-depth in-body guard to claim_outbound_email_batch,
--     which previously had none (it relied solely on the ineffective
--     revoke-from-public).
--
-- Future functions: this class of bug is prevented from recurring by a
-- regression assertion in supabase/tests/rls_smoke.sql, which fails CI if
-- ANY non-allowlisted public function becomes EXECUTE-able by anon or
-- authenticated. (A schema-wide `ALTER DEFAULT PRIVILEGES ... REVOKE` was
-- evaluated and rejected: in Postgres 16 it does not actually remove the
-- built-in PUBLIC EXECUTE grant from newly created functions — verified
-- empirically — so it would give false security. The CI test is the
-- deterministic backstop instead.)
--
-- pg_cron runs these as the table owner (no JWT → auth.role() is NULL)
-- and the drain route calls them with the service-role key
-- (auth.role() = 'service_role'); both keep their grants and keep working.

-- ─── 1. claim_outbound_email_batch — add in-body guard (HIGH) ────────
-- Converted from `language sql` to `language plpgsql` so we can gate on
-- the caller's JWT role. The UPDATE ... RETURNING body is otherwise
-- byte-for-byte the original from migration 20260530000003.
--
-- Guard: only the service role (drain route) or a context with no JWT
-- at all (pg_cron, running as owner) may proceed. Any real end-user
-- token — anon or authenticated — is rejected.
create or replace function public.claim_outbound_email_batch(p_limit int default 20)
returns table (
  id            uuid,
  to_address    text,
  subject       text,
  text_body     text,
  html_body     text,
  reply_to      text,
  attempts      int,
  max_attempts  int
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is not null and auth.role() <> 'service_role' then
    raise exception 'Forbidden: service role required' using errcode = '42501';
  end if;

  -- NOTE: the RETURNS TABLE columns (id, attempts, max_attempts, …) are
  -- PL/pgSQL variables here, so every column reference in the body is
  -- table-qualified to avoid "ambiguous column" against those variables.
  return query
  update public.outbound_email oe
     set last_attempted_at = now(),
         next_attempt_at   = now() + interval '10 minutes'
   where oe.id in (
     select pending.id
       from public.outbound_email pending
      where pending.sent_at is null
        and pending.attempts < pending.max_attempts
        and pending.next_attempt_at <= now()
      order by pending.created_at
      limit p_limit
      for update skip locked
   )
  returning oe.id, oe.to_address, oe.subject, oe.text_body, oe.html_body, oe.reply_to,
            oe.attempts, oe.max_attempts;
end;
$$;

-- ─── 2. Revoke EXECUTE from every untrusted grantee ─────────────────
-- These are all internal/cron/service-only. We revoke from all three of
-- `public, anon, authenticated`:
--   * anon + authenticated  — they hold DIRECT grants via Supabase's
--     default privileges, so `revoke from public` alone is a no-op;
--   * public                — the Postgres system default also grants
--     EXECUTE to PUBLIC (all roles), so leaving it would keep the
--     function reachable by anon/authenticated via PUBLIC membership.
-- Only revoking all three actually locks the function. The owner
-- (postgres) and `service_role` keep their own grants and are unaffected.
revoke execute on function public.claim_outbound_email_batch(int)            from public, anon, authenticated;
revoke execute on function public.cron_drain_outbound_email()                from public, anon, authenticated;
revoke execute on function public.expire_opportunities()                     from public, anon, authenticated;
revoke execute on function public.expire_events()                            from public, anon, authenticated;
revoke execute on function public.expire_vcs_grants()                        from public, anon, authenticated;
revoke execute on function public.purge_rejected_listings()                  from public, anon, authenticated;

-- enqueue_* already have in-body guards (auth.uid() / is_admin()) and
-- were revoked from `public` + `authenticated` in 20260531000004, but
-- `anon`'s direct grant was never named. Close that gap too — defence in
-- depth even though the in-body check already rejects them.
revoke execute on function public.enqueue_outbound_email(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.enqueue_outbound_email_bulk(jsonb)                   from public, anon, authenticated;

-- ─── 3. Internal helper + trigger functions ─────────────────────────
-- `is_imperial_email` is a domain-check helper called only from inside
-- SECURITY DEFINER functions (submit_onboarding, tg_handle_new_user,
-- tg_auth_users_protect_email_domain) — those run as the owner, so they
-- keep working after this revoke. No end-user path calls it directly.
-- Not referenced by any RLS policy (only is_admin/is_approved are), so
-- revoking from authenticated is safe — confirmed against all policies.
revoke execute on function public.is_imperial_email(text) from public, anon, authenticated;

-- Trigger functions have no business being called as RPCs. Revoking
-- EXECUTE does NOT stop them firing — Postgres does not check EXECUTE
-- privilege when a trigger fires — so this is zero-breakage. It only
-- removes the ability to invoke them directly over PostgREST.
revoke execute on function public.tg_auth_users_protect_email_domain()             from public, anon, authenticated;
revoke execute on function public.tg_cleanup_listing_events_for_listing()          from public, anon, authenticated;
revoke execute on function public.tg_cleanup_user_listing_actions_for_listing()    from public, anon, authenticated;
revoke execute on function public.tg_events_protect_society_flag()                 from public, anon, authenticated;
revoke execute on function public.tg_handle_new_user()                             from public, anon, authenticated;
revoke execute on function public.tg_listings_protect_status()                     from public, anon, authenticated;
revoke execute on function public.tg_profiles_protect_role()                       from public, anon, authenticated;
revoke execute on function public.tg_profiles_protect_status()                     from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at()                              from public, anon, authenticated;

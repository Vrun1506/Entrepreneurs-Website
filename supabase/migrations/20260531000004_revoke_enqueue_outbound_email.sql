-- ════════════════════════════════════════════════════════════════════
-- Foundry · Close the open phishing RPC
--
-- enqueue_outbound_email(p_to,...) was SECURITY DEFINER + GRANT to
-- authenticated, with only an `auth.uid() is not null` check. Any
-- authenticated session — including pending_onboarding or rejected
-- users with a still-valid JWT — could enqueue arbitrary email from
-- the Foundry sending domain (signed with our SPF/DKIM/DMARC),
-- turning the platform into a phishing relay.
--
-- Fix: revoke EXECUTE from `authenticated` and `public` on both the
-- single-row and bulk enqueue RPCs. lib/email.ts now writes to
-- outbound_email directly via the service-role client (which bypasses
-- RLS), so the user-JWT entry point is no longer needed. The RPCs
-- themselves remain in place for the service role / postgres owner
-- to retain operational flexibility.
-- ════════════════════════════════════════════════════════════════════

revoke execute on function public.enqueue_outbound_email(text, text, text, text, text) from public;
revoke execute on function public.enqueue_outbound_email(text, text, text, text, text) from authenticated;

revoke execute on function public.enqueue_outbound_email_bulk(jsonb) from public;
revoke execute on function public.enqueue_outbound_email_bulk(jsonb) from authenticated;

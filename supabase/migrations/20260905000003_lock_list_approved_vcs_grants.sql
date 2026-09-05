-- ════════════════════════════════════════════════════════════════════
-- Foundry · Lock list_approved_vcs_grants grants
--
-- Security audit 2026-09-05 (MEDIUM), caught by the hardened test 21 in
-- rls_smoke.sql (20260905000002's sibling fix) rather than by manual
-- review — the same class of bug as 20260905000001, just a third
-- instance nobody had checked yet.
--
-- 20260904000002_paginate_approved_vcs_grants.sql created
-- list_approved_vcs_grants and granted it to `authenticated` only, but
-- never restated a `revoke ... from public, anon` — so on this Supabase
-- project (default privileges grant anon/authenticated EXECUTE on every
-- new public function, see 20260608000001) it has been anon-executable
-- since 2026-09-04.
--
-- Not currently exploitable: the function gates in-body on
-- `is_approved() or is_admin()`, both NULL/false for anon's NULL
-- auth.uid(), so an anon call raises rather than returning rows.
-- ════════════════════════════════════════════════════════════════════

revoke execute on function public.list_approved_vcs_grants(
  text, text, date, date, int, int
) from public, anon;

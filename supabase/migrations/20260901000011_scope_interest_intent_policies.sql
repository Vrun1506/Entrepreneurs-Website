-- ════════════════════════════════════════════════════════════════════
-- Foundry · Scope profile_interests/profile_intents SELECT policies
--
-- Both tables' SELECT policies (20260901000005) were created without a
-- `to` clause, which defaults to PUBLIC — including anon. Not exploitable
-- today: every USING clause here compares profile_id = auth.uid(), and
-- auth.uid() is null for an unauthenticated caller, so `profile_id = null`
-- never matches any row regardless of role. But every other policy in
-- this codebase explicitly names its role, and an implicit PUBLIC scope
-- is one future anon-reachable view away from a real hole. This brings
-- these four in line with that convention.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists profile_interests_select_own on public.profile_interests;
create policy profile_interests_select_own
  on public.profile_interests for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists profile_interests_select_admin on public.profile_interests;
create policy profile_interests_select_admin
  on public.profile_interests for select
  to authenticated
  using (public.is_admin());

drop policy if exists profile_intents_select_own on public.profile_intents;
create policy profile_intents_select_own
  on public.profile_intents for select
  to authenticated
  using (profile_id = auth.uid());

drop policy if exists profile_intents_select_admin on public.profile_intents;
create policy profile_intents_select_admin
  on public.profile_intents for select
  to authenticated
  using (public.is_admin());

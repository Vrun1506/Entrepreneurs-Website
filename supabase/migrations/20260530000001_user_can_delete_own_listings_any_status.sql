-- ════════════════════════════════════════════════════════════════════
-- Foundry · Users can delete their own listings at any status
--
-- Previous policy (migration 8) let users delete pending + rejected
-- rows. This extends to approved + expired so a poster has full control
-- over content they put out — matches the same user-owns-their-content
-- model as the account deletion flow (which clears all of a user's
-- listings on auth.users delete).
--
-- Note: this only affects user-initiated deletes via PostgREST. Admins
-- have a separate delete policy that's unaffected, and the listing
-- status protection trigger (tg_listings_protect_status) still gates
-- *status changes*, so you can't, e.g., move a row back to 'pending'
-- after rejection.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists opportunities_delete_own on public.opportunities;
create policy opportunities_delete_own on public.opportunities
  for delete to authenticated
  using (posted_by = auth.uid());

drop policy if exists events_delete_own on public.events;
create policy events_delete_own on public.events
  for delete to authenticated
  using (posted_by = auth.uid());

drop policy if exists vcs_grants_delete_own on public.vcs_grants;
create policy vcs_grants_delete_own on public.vcs_grants
  for delete to authenticated
  using (posted_by = auth.uid());

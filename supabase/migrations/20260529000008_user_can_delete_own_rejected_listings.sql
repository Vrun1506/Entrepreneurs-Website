-- ════════════════════════════════════════════════════════════════════
-- Foundry · Let users delete their own rejected listings
--
-- The original RLS delete policies on opportunities/events/vcs_grants
-- only permitted deletion while status='pending', which made it
-- impossible for a user to clear a rejected row out of their
-- /my-submissions list. Approved rows still cannot be deleted by the
-- poster — that protects community content from being yanked once it's
-- been published.
-- ════════════════════════════════════════════════════════════════════

drop policy if exists opportunities_delete_own on public.opportunities;
create policy opportunities_delete_own on public.opportunities
  for delete to authenticated
  using (posted_by = auth.uid() and status in ('pending', 'rejected'));

drop policy if exists events_delete_own on public.events;
create policy events_delete_own on public.events
  for delete to authenticated
  using (posted_by = auth.uid() and status in ('pending', 'rejected'));

drop policy if exists vcs_grants_delete_own on public.vcs_grants;
create policy vcs_grants_delete_own on public.vcs_grants
  for delete to authenticated
  using (posted_by = auth.uid() and status in ('pending', 'rejected'));

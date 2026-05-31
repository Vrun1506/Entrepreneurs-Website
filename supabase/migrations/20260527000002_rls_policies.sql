-- ════════════════════════════════════════════════════════════════════
-- Foundry · Row Level Security policies
--
-- Default-deny model: RLS is enabled on every table; only the rows and
-- operations explicitly permitted below are allowed.
--
-- Visibility rules:
--   - Own data: users can always see and edit (within limits) their own
--     profile and their own listings.
--   - Directory: approved users see other approved users.
--   - Listings: approved users see approved listings.
--   - Admin: sees everything; modifies via SECURITY DEFINER functions
--     in 20260527000003_admin_functions.sql.
--
-- Write protection:
--   - profiles.status is protected by trigger (see initial schema).
--   - opportunities.status / vcs_grants.status protected by trigger.
--   - admin_actions writes are only via SECURITY DEFINER functions.
-- ════════════════════════════════════════════════════════════════════

-- ─── Profiles ────────────────────────────────────────────────────────
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_directory on public.profiles
  for select to authenticated
  using (status = 'approved' and public.is_approved());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ─── Skills / sectors (lookup) ───────────────────────────────────────
-- Public read so the marketing site and the onboarding form can render
-- the lists without authentication.
create policy skills_select_public  on public.skills  for select to anon, authenticated using (true);
create policy sectors_select_public on public.sectors for select to anon, authenticated using (true);

create policy skills_admin_write  on public.skills  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sectors_admin_write on public.sectors for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ─── Profile interests (junctions) ───────────────────────────────────
create policy profile_skills_select on public.profile_skills
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or (
      public.is_approved()
      and exists (
        select 1 from public.profiles p
        where p.id = profile_id and p.status = 'approved'
      )
    )
  );

create policy profile_skills_modify_own on public.profile_skills
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy profile_sectors_select on public.profile_sectors
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_admin()
    or (
      public.is_approved()
      and exists (
        select 1 from public.profiles p
        where p.id = profile_id and p.status = 'approved'
      )
    )
  );

create policy profile_sectors_modify_own on public.profile_sectors
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ─── Opportunities ───────────────────────────────────────────────────
create policy opportunities_select_approved on public.opportunities
  for select to authenticated
  using (status = 'approved' and public.is_approved());

create policy opportunities_select_own on public.opportunities
  for select to authenticated
  using (posted_by = auth.uid());

create policy opportunities_select_admin on public.opportunities
  for select to authenticated
  using (public.is_admin());

-- Only approved users can post. Status is forced to 'pending' on insert.
-- Approval metadata must be null on insert (CHECK constraint enforces).
create policy opportunities_insert_own on public.opportunities
  for insert to authenticated
  with check (
    posted_by = auth.uid()
    and public.is_approved()
    and status = 'pending'
    and approved_at is null
    and approved_by is null
    and rejected_reason is null
  );

-- Posters can edit their own pending listing only.
-- Status changes blocked by trigger; approval cols can't be set here.
create policy opportunities_update_own on public.opportunities
  for update to authenticated
  using (posted_by = auth.uid() and status = 'pending')
  with check (posted_by = auth.uid() and status = 'pending');

create policy opportunities_update_admin on public.opportunities
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy opportunities_delete_own on public.opportunities
  for delete to authenticated
  using (posted_by = auth.uid() and status = 'pending');

create policy opportunities_delete_admin on public.opportunities
  for delete to authenticated
  using (public.is_admin());

-- ─── Opportunity tags (mirror parent visibility) ─────────────────────
create policy opportunity_skills_select on public.opportunity_skills
  for select to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and (
          (o.status = 'approved' and public.is_approved())
          or o.posted_by = auth.uid()
          or public.is_admin()
        )
    )
  );

create policy opportunity_skills_modify_own on public.opportunity_skills
  for all to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
        and o.status = 'pending'
    )
  )
  with check (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
        and o.status = 'pending'
    )
  );

create policy opportunity_sectors_select on public.opportunity_sectors
  for select to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and (
          (o.status = 'approved' and public.is_approved())
          or o.posted_by = auth.uid()
          or public.is_admin()
        )
    )
  );

create policy opportunity_sectors_modify_own on public.opportunity_sectors
  for all to authenticated
  using (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
        and o.status = 'pending'
    )
  )
  with check (
    exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id
        and o.posted_by = auth.uid()
        and o.status = 'pending'
    )
  );

-- ─── VCs and grants ──────────────────────────────────────────────────
create policy vcs_grants_select_approved on public.vcs_grants
  for select to authenticated
  using (status = 'approved' and public.is_approved());

create policy vcs_grants_select_own on public.vcs_grants
  for select to authenticated
  using (posted_by = auth.uid());

create policy vcs_grants_select_admin on public.vcs_grants
  for select to authenticated
  using (public.is_admin());

create policy vcs_grants_insert_own on public.vcs_grants
  for insert to authenticated
  with check (
    posted_by = auth.uid()
    and public.is_approved()
    and status = 'pending'
    and approved_at is null
    and approved_by is null
    and rejected_reason is null
  );

create policy vcs_grants_update_own on public.vcs_grants
  for update to authenticated
  using (posted_by = auth.uid() and status = 'pending')
  with check (posted_by = auth.uid() and status = 'pending');

create policy vcs_grants_update_admin on public.vcs_grants
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy vcs_grants_delete_own on public.vcs_grants
  for delete to authenticated
  using (posted_by = auth.uid() and status = 'pending');

create policy vcs_grants_delete_admin on public.vcs_grants
  for delete to authenticated
  using (public.is_admin());

-- ─── Admins ──────────────────────────────────────────────────────────
-- Only admins can see the admin list. INSERT/UPDATE/DELETE only via
-- service_role (Supabase dashboard or service-role key).
create policy admins_select_admin on public.admins
  for select to authenticated
  using (public.is_admin());

-- ─── Admin actions (audit log) ───────────────────────────────────────
-- Read-only for admins. Inserts are only via SECURITY DEFINER functions.
create policy admin_actions_select_admin on public.admin_actions
  for select to authenticated
  using (public.is_admin());

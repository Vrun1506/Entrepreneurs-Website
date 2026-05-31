-- ════════════════════════════════════════════════════════════════════
-- Foundry · Account deletion clears all user-owned data
--
-- The original RPC just deleted the auth.users row and relied on
-- cascades. That works for profile + skills + sectors + admins, but the
-- listings tables (opportunities, events, vcs_grants) and admin_actions
-- use ON DELETE RESTRICT on the user reference — the cascade blows up
-- the moment a user has posted anything.
--
-- This version explicitly clears every row a user owns before deleting
-- the auth row, so the cascade succeeds for any account regardless of
-- activity.
--
-- What's deleted on account deletion:
--   • opportunities / events / vcs_grants the user posted
--     (and their skill/sector joins, via existing CASCADEs)
--   • admin_actions the user authored as admin
--   • profile + profile_skills + profile_sectors (via auth.users cascade)
--   • admins row, if any (via auth.users cascade)
--   • auth.users row itself
--
-- What's kept:
--   • listings other people posted that this user approved — those keep
--     the listing content; approved_by is set to NULL via existing FK
--   • admin_actions where target_id references this user — these are
--     operational audit records of actions taken *about* them, and
--     target_id has no FK enforcement so they're not blocking anyway
-- ════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Listings the caller posted. The CASCADE on
  -- opportunity_skills / opportunity_sectors handles the join tables.
  delete from public.opportunities where posted_by = v_caller;
  delete from public.events        where posted_by = v_caller;
  delete from public.vcs_grants    where posted_by = v_caller;

  -- Admin actions the caller authored. RESTRICT FK on admin_id would
  -- otherwise block the auth.users delete for any admin who's ever
  -- approved or rejected anything.
  delete from public.admin_actions where admin_id = v_caller;

  -- Finally remove the auth row. Cascades to public.profiles (which
  -- cascades again to profile_skills + profile_sectors) and public.admins.
  delete from auth.users where id = v_caller;
end;
$$;

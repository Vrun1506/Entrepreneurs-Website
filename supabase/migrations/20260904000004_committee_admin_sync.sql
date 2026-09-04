-- ════════════════════════════════════════════════════════════════════
-- Foundry · Committee membership carries admin access
--
-- Business rule: everyone on committee is an admin, for exactly as long
-- as they're on committee — joining grants it, leaving revokes it. This
-- extends admin_set_committee (20260904000003) to insert/delete the
-- public.admins row alongside the is_committee flag it already toggles,
-- rather than adding a second admin-only step for the same action.
--
-- admins' own RLS comment says "INSERT/UPDATE/DELETE only via
-- service_role" — that predates this migration and is now also true of
-- this SECURITY DEFINER function, the same exception admin_actions
-- already carries for its own inserts.
--
-- This does not touch anyone made admin outside this flow (e.g. the
-- imperial.founders@gmail.com account) — the new logic only inserts or
-- deletes the specific row for p_member_id, and only on an actual
-- is_committee transition.
--
-- Note: is_admin() is checked ahead of the approval-status redirect in
-- requireApprovedUser (admins bypass it to browse the user-facing UI —
-- see frontend/src/lib/auth/guard.ts), so a committee member added
-- while still mid-onboarding gets full access immediately, same as any
-- other admin would. That's an accepted consequence of the rule, not a
-- bug: committee escalation is itself admin-only, so it's already a
-- trusted action.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_set_committee(
  p_member_id     uuid,
  p_is_committee  boolean,
  p_committee_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_was_committee boolean;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_is_committee and coalesce(trim(p_committee_role), '') = '' then
    raise exception 'A committee role is required' using errcode = '22023';
  end if;

  select is_committee into v_was_committee from public.profiles where id = p_member_id;
  if not found then
    raise exception 'Member not found' using errcode = '22023';
  end if;

  update public.profiles
     set is_committee   = p_is_committee,
         committee_role = case when p_is_committee then trim(p_committee_role) else null end
   where id = p_member_id;

  if p_is_committee and not v_was_committee then
    insert into public.admins (user_id) values (p_member_id)
      on conflict (user_id) do nothing;
    insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
      values (v_caller, 'grant_committee_admin', 'admins', p_member_id, null);
  elsif v_was_committee and not p_is_committee then
    delete from public.admins where user_id = p_member_id;
    insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
      values (v_caller, 'revoke_committee_admin', 'admins', p_member_id, null);
  end if;
end;
$$;

-- Grant unchanged from 20260904000003 (same signature) — restated only
-- as a no-op confirmation, since CREATE OR REPLACE does not touch grants.
revoke execute on function public.admin_set_committee(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_committee(uuid, boolean, text) to authenticated;

-- ─── One-time backfill: current committee members become admins ──────
-- Insert-only, so this cannot demote or remove any existing admin —
-- including one added outside this flow (the founders account).
insert into public.admins (user_id)
select id from public.profiles where is_committee
on conflict (user_id) do nothing;

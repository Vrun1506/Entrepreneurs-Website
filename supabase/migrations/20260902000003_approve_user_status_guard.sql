-- ════════════════════════════════════════════════════════════════════
-- Foundry · approve_user guards against re-processing
--
-- reject_user (20260531000001) already raises loudly on a stale/repeat
-- call: "only pending_review users can be rejected" — its own header
-- comment explains this was deliberately tightened from an earlier
-- version that "flipped status idempotently" and called that a silent
-- state-corruption risk. approve_user (20260530000004) never got the
-- same treatment: it unconditionally sets status = 'approved' regardless
-- of the row's current status.
--
-- Concretely: a devtools-bypassed double-click on Approve, or two admin
-- tabs racing on the same pending applicant, both succeed today — each
-- success is read by admin/users/actions.ts's approveUser as "just
-- approved this user", so each one fires a duplicate acceptance email and
-- writes a duplicate admin_actions audit row. Bringing this in line with
-- reject_user's own convention: raise on a non-pending_review target
-- rather than silently re-running.
--
-- Body is 20260530000004's verbatim, signature unchanged (CREATE OR
-- REPLACE is enough), with the status captured before the UPDATE and the
-- same guard shape reject_user already uses.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.approve_user(
  p_user_id uuid,
  p_notes   text default null
)
returns table (email text, first_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.user_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  select status into v_status from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Profile not found: %', p_user_id;
  end if;
  if v_status <> 'pending_review' then
    raise exception 'User is not pending review (status=%)', v_status;
  end if;

  update public.profiles set status = 'approved' where id = p_user_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_user', 'profiles', p_user_id, p_notes);

  return query
    select u.email::text, p.first_name
      from auth.users u
      join public.profiles p on p.id = u.id
     where u.id = p_user_id;
end;
$$;

-- Grant unchanged from 20260530000004 (same signature) — restated only as
-- a no-op confirmation, since CREATE OR REPLACE does not touch grants.
grant execute on function public.approve_user(uuid, text) to authenticated;

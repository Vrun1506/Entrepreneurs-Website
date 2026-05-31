-- ════════════════════════════════════════════════════════════════════
-- Foundry · reject_user now hard-deletes the applicant
--
-- GDPR data-minimisation: a rejected applicant has no operational
-- relationship with the community, so retaining their profile + skills
-- + sectors indefinitely is not justifiable. This migration rewrites
-- reject_user to mirror admin_delete_user's full FK cleanup before
-- removing the auth.users row.
--
-- The function signature is unchanged: it still returns (email,
-- first_name) so the admin server action can fire the rejection email
-- before the data is gone. The "reply to appeal" line in
-- sendRejectionEmail covers the case where a rejection was a mistake;
-- restored applicants re-enter via the standard signup flow.
--
-- Re-rejection note: this rewrite enforces "only pending_review users
-- can be rejected". Previously the void-then-table version flipped
-- status idempotently; now a stale Reject click on someone already
-- gone (or already approved) errors loudly rather than silently
-- corrupting state.
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.reject_user(uuid, text);

create or replace function public.reject_user(
  p_user_id uuid,
  p_reason  text
)
returns table(email text, first_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_email  text;
  v_first  text;
  v_status public.user_status;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;
  if p_user_id = v_caller then
    raise exception 'Cannot reject your own account';
  end if;

  -- Capture identity + current status before the cascade wipes it.
  select au.email::text, p.first_name, p.status
    into v_email, v_first, v_status
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = p_user_id;

  if v_email is null then
    raise exception 'User not found: %', p_user_id;
  end if;

  -- Hard guard: rejection is for users still under review. Approved
  -- members go through admin_delete_user (which also captures a
  -- reason); already-deleted rows never reach here.
  if v_status is null or v_status <> 'pending_review' then
    raise exception 'User is not pending review (status=%)', v_status;
  end if;

  -- Same blocking-FK cleanup as admin_delete_user. A pending_review
  -- user normally has zero posted listings (post buttons require
  -- approved status), but we include the cleanup for defence against
  -- future flow changes.
  delete from public.opportunities where posted_by = p_user_id;
  delete from public.events        where posted_by = p_user_id;
  delete from public.vcs_grants    where posted_by = p_user_id;
  delete from public.admin_actions where admin_id  = p_user_id;

  -- Cascades through profile, profile_skills, profile_sectors,
  -- opportunity_bookmarks (FK cascade), and listing_events viewer rows.
  delete from auth.users where id = p_user_id;

  -- Audit row captures the rejection. target_id points at the now-
  -- deleted auth.users uuid; the reason text is the only PII we retain.
  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_user', 'auth.users', p_user_id, p_reason);

  return query select v_email, v_first;
end;
$$;

revoke all on function public.reject_user(uuid, text) from public;
grant execute on function public.reject_user(uuid, text) to authenticated;

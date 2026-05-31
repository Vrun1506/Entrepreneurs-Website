-- ════════════════════════════════════════════════════════════════════
-- Foundry · Admin operation functions
--
-- SECURITY DEFINER functions are the only path admins should use to
-- approve / reject anything. Each:
--   - verifies the caller is in public.admins
--   - performs the state change atomically
--   - records an admin_actions audit row in the same transaction
--
-- Rejecting requires a reason; approving may include optional notes.
-- ════════════════════════════════════════════════════════════════════

-- ─── approve_opportunity ─────────────────────────────────────────────
create or replace function public.approve_opportunity(
  p_opportunity_id uuid,
  p_notes          text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  update public.opportunities
     set status          = 'approved',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = null
   where id = p_opportunity_id;

  if not found then
    raise exception 'Opportunity not found: %', p_opportunity_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_opportunity', 'opportunities', p_opportunity_id, p_notes);
end;
$$;

-- ─── reject_opportunity ──────────────────────────────────────────────
create or replace function public.reject_opportunity(
  p_opportunity_id uuid,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  update public.opportunities
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_opportunity_id;

  if not found then
    raise exception 'Opportunity not found: %', p_opportunity_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_opportunity', 'opportunities', p_opportunity_id, p_reason);
end;
$$;

-- ─── approve_vc_grant ────────────────────────────────────────────────
create or replace function public.approve_vc_grant(
  p_id    uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  update public.vcs_grants
     set status          = 'approved',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = null
   where id = p_id;

  if not found then
    raise exception 'VC/grant not found: %', p_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_vc_grant', 'vcs_grants', p_id, p_notes);
end;
$$;

-- ─── reject_vc_grant ─────────────────────────────────────────────────
create or replace function public.reject_vc_grant(
  p_id     uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  update public.vcs_grants
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_id;

  if not found then
    raise exception 'VC/grant not found: %', p_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_vc_grant', 'vcs_grants', p_id, p_reason);
end;
$$;

-- ─── approve_user (alumni manual review pass) ────────────────────────
create or replace function public.approve_user(
  p_user_id uuid,
  p_notes   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  update public.profiles set status = 'approved' where id = p_user_id;
  if not found then
    raise exception 'Profile not found: %', p_user_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'approve_user', 'profiles', p_user_id, p_notes);
end;
$$;

-- ─── reject_user ─────────────────────────────────────────────────────
create or replace function public.reject_user(
  p_user_id uuid,
  p_reason  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Rejection reason is required';
  end if;

  update public.profiles set status = 'rejected' where id = p_user_id;
  if not found then
    raise exception 'Profile not found: %', p_user_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_user', 'profiles', p_user_id, p_reason);
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function public.approve_opportunity(uuid, text) to authenticated;
grant execute on function public.reject_opportunity(uuid, text)  to authenticated;
grant execute on function public.approve_vc_grant(uuid, text)    to authenticated;
grant execute on function public.reject_vc_grant(uuid, text)     to authenticated;
grant execute on function public.approve_user(uuid, text)        to authenticated;
grant execute on function public.reject_user(uuid, text)         to authenticated;

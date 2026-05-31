-- ════════════════════════════════════════════════════════════════════
-- Foundry · Listing reject RPCs return the poster's email + name + title
--
-- Mirrors what migration 9 did for reject_user: rewrites
-- reject_opportunity / reject_event / reject_vc_grant from returning void
-- to returning (email, first_name, title) so the admin server actions
-- can email the poster a rejection notice without a second round-trip.
--
-- Behaviour is otherwise unchanged: admin check, reason-required check,
-- status flip with approved_at/by + rejected_reason, admin_actions row.
-- Title is mapped from each listing's natural display field:
--   opportunities → position_name
--   events        → title
--   vcs_grants    → name
-- ════════════════════════════════════════════════════════════════════

-- ─── reject_opportunity ──────────────────────────────────────────────
drop function if exists public.reject_opportunity(uuid, text);

create or replace function public.reject_opportunity(
  p_opportunity_id uuid,
  p_reason         text
)
returns table(email text, first_name text, title text)
language plpgsql
security definer
set search_path = public, auth
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

  return query
    select au.email::text, p.first_name, o.position_name as title
      from public.opportunities o
      join public.profiles p on p.id = o.posted_by
      join auth.users au     on au.id = o.posted_by
     where o.id = p_opportunity_id;
end;
$$;

grant execute on function public.reject_opportunity(uuid, text) to authenticated;

-- ─── reject_event ────────────────────────────────────────────────────
drop function if exists public.reject_event(uuid, text);

create or replace function public.reject_event(
  p_event_id uuid,
  p_reason   text
)
returns table(email text, first_name text, title text)
language plpgsql
security definer
set search_path = public, auth
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

  update public.events
     set status          = 'rejected',
         approved_at     = now(),
         approved_by     = v_caller,
         rejected_reason = p_reason
   where id = p_event_id;

  if not found then
    raise exception 'Event not found: %', p_event_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'reject_event', 'events', p_event_id, p_reason);

  return query
    select au.email::text, p.first_name, e.title
      from public.events e
      join public.profiles p on p.id = e.posted_by
      join auth.users au     on au.id = e.posted_by
     where e.id = p_event_id;
end;
$$;

grant execute on function public.reject_event(uuid, text) to authenticated;

-- ─── reject_vc_grant ─────────────────────────────────────────────────
drop function if exists public.reject_vc_grant(uuid, text);

create or replace function public.reject_vc_grant(
  p_id     uuid,
  p_reason text
)
returns table(email text, first_name text, title text)
language plpgsql
security definer
set search_path = public, auth
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

  return query
    select au.email::text, p.first_name, v.name as title
      from public.vcs_grants v
      join public.profiles p on p.id = v.posted_by
      join auth.users au     on au.id = v.posted_by
     where v.id = p_id;
end;
$$;

grant execute on function public.reject_vc_grant(uuid, text) to authenticated;

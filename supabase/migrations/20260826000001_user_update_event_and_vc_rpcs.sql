-- ════════════════════════════════════════════════════════════════════
-- Foundry · Bring the event and VC/grant edit paths onto RPCs
--
-- The three "edit your own pending listing" paths used three different
-- mechanisms: opportunities went through update_opportunity (migration
-- 20260529000009), while events and vcs_grants did a client-library
-- PostgREST UPDATE relying on RLS.
--
-- 20260529000009's header argued events/vcs "don't need an RPC" because
-- RLS already permits the update. That is true and was never a security
-- hole — RLS does gate it correctly, and rls_smoke tests 23-25 pin that.
-- Two things changed the calculus:
--
--   1. app/events/actions.ts states the project's own rule — prefer a
--      stable RPC boundary because "client-direct PostgREST UPDATEs are
--      migration-hostile" — and then the function immediately below it
--      does a PostgREST update. The FastAPI move is what that rule
--      exists for.
--   2. No generic updateOwnListing(kind, id, payload) can exist while
--      the three disagree, which blocks the listing registry.
--
-- So: match opportunities. Same shape, same guards, same order.
--
-- As in update_opportunity, the in-body ownership + status checks are
-- the security boundary, not RLS — SECURITY DEFINER bypasses RLS, so
-- the function has to re-check what the policy would have.
--
-- Neither function accepts the columns a poster must not set:
-- is_society_event (admin-only, with a trigger backstop) and status /
-- approval metadata.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.update_event(
  p_id                    uuid,
  p_title                 text,
  p_description           text,
  p_luma_link             text,
  p_event_at              timestamptz,
  p_location              text,
  p_organiser_name        text,
  p_contact_email         text,
  p_contact_email_visible boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_status listing_status;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select posted_by, status into v_owner, v_status
    from public.events where id = p_id;
  if not found then
    raise exception 'Event not found, or it has been removed.' using errcode = '42501';
  end if;
  if v_owner <> v_caller then
    raise exception 'You can only edit your own listings' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending listings can be edited' using errcode = '42501';
  end if;

  -- Mirrors update_opportunity's deadline guard. The five-minute grace
  -- matches eventSchema's, so a submission for an imminent event isn't
  -- refused by its own round trip.
  if p_event_at is null or p_event_at < now() - interval '5 minutes' then
    raise exception 'Event must start in the future';
  end if;

  update public.events
     set title                 = p_title,
         description           = p_description,
         luma_link             = p_luma_link,
         event_at              = p_event_at,
         location              = p_location,
         organiser_name        = p_organiser_name,
         contact_email         = p_contact_email,
         contact_email_visible = coalesce(p_contact_email_visible, false)
   where id = p_id;
end;
$$;

create or replace function public.update_vc_grant(
  p_id          uuid,
  p_kind        vc_grant_kind,
  p_name        text,
  p_description text,
  p_link        text,
  p_amount      text,
  p_deadline    date,
  p_stage       text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_owner  uuid;
  v_status listing_status;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select posted_by, status into v_owner, v_status
    from public.vcs_grants where id = p_id;
  if not found then
    raise exception 'Listing not found, or it has been removed.' using errcode = '42501';
  end if;
  if v_owner <> v_caller then
    raise exception 'You can only edit your own listings' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only pending listings can be edited' using errcode = '42501';
  end if;

  -- No deadline guard here on purpose: a VC/grant deadline is optional
  -- and a rolling-application listing legitimately has none.
  update public.vcs_grants
     set kind        = p_kind,
         name        = p_name,
         description = p_description,
         link        = p_link,
         amount      = p_amount,
         deadline    = p_deadline,
         stage       = p_stage
   where id = p_id;
end;
$$;

-- Named-role grants, matching update_opportunity. anon keeps Supabase's
-- default EXECUTE, which is harmless: the first thing both functions do is
-- reject a caller with no auth.uid(). rls_smoke test 21 requires both names
-- to be added to its allowlist, which is the deliberate edit that tripwire
-- is designed to force.
grant execute on function public.update_event(
  uuid, text, text, text, timestamptz, text, text, text, boolean
) to authenticated;

grant execute on function public.update_vc_grant(
  uuid, vc_grant_kind, text, text, text, text, date, text
) to authenticated;

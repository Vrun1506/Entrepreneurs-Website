-- ════════════════════════════════════════════════════════════════════
-- Foundry · Lock profiles.status to admin / RPC paths only
--
-- Bug fixed:
--   The previous tg_profiles_protect_status trigger allowed any user
--   with status='pending_onboarding' to self-transition to either
--   'pending_review' or 'approved' irrespective of role. The role-aware
--   mapping ("student → approved, alum → pending_review") was enforced
--   only inside submit_onboarding(); a malicious alum could bypass
--   admin review by issuing a direct PostgREST UPDATE that set
--   status='approved' alongside grad_year/course.
--
-- Fix model:
--   1. submit_onboarding() sets a transaction-local GUC
--        foundry.onboarding_submission = 'true'
--      immediately before the UPDATE that flips status. The flag is
--      transaction-local (set_config 3rd arg true) so it never leaks
--      across statements or connections.
--   2. tg_profiles_protect_status no longer has a user-initiated
--      branch. The only ways to change status are:
--         - service_role  (Supabase dashboard / backup tools)
--         - is_admin()
--         - the GUC set by submit_onboarding (a SECURITY DEFINER fn
--           whose role-mapping CASE is the actual policy)
--      A direct PostgREST UPDATE has none of these set and is rejected.
--
-- submit_onboarding() is re-created verbatim from migration
-- 20260527000009 with only the set_config call added at the top of
-- the body. All other behaviour (CHECK constraints, skill/sector
-- replacement) is preserved.
-- ════════════════════════════════════════════════════════════════════

-- ─── Tighter status-protect trigger ─────────────────────────────────
create or replace function public.tg_profiles_protect_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    -- Trusted-call marker. submit_onboarding sets this GUC immediately
    -- before its UPDATE. It is transaction-local, so it cannot persist
    -- between requests, and it is not user-settable from outside a
    -- SECURITY DEFINER function (PostgREST does not expose set_config).
    if coalesce(current_setting('foundry.onboarding_submission', true), '') = 'true' then
      return new;
    end if;
    raise exception 'Only admins can change profile status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── submit_onboarding: set the GUC, then UPDATE ────────────────────
create or replace function public.submit_onboarding(
  p_linkedin_url text,
  p_grad_year    int,
  p_bio          text,
  p_working_on   text,
  p_skill_ids    smallint[],
  p_sector_ids   smallint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller     uuid := auth.uid();
  v_role       user_role;
  v_status     user_status;
  v_new_status user_status;
  v_linkedin   text;
  v_bio        text;
  v_working    text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role, status into v_role, v_status
    from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending_onboarding' then
    raise exception 'Onboarding already submitted' using errcode = '22023';
  end if;

  v_linkedin := nullif(trim(p_linkedin_url), '');
  if v_linkedin is null then
    raise exception 'LinkedIn URL is required';
  end if;

  v_bio     := nullif(trim(coalesce(p_bio, '')), '');
  v_working := nullif(trim(coalesce(p_working_on, '')), '');

  v_new_status := case v_role
    when 'alum'    then 'pending_review'::user_status
    when 'student' then 'approved'::user_status
  end;

  -- Mark this transaction as a trusted onboarding-submission call so
  -- the protect-status trigger lets the status flip through. Local to
  -- this transaction (3rd arg = true); cleared automatically at COMMIT
  -- and not visible to any other session.
  perform set_config('foundry.onboarding_submission', 'true', true);

  update public.profiles
     set linkedin_url = v_linkedin,
         grad_year    = case when v_role = 'alum' then p_grad_year else null end,
         bio          = v_bio,
         working_on   = v_working,
         status       = v_new_status
   where id = v_caller;

  delete from public.profile_skills  where profile_id = v_caller;
  delete from public.profile_sectors where profile_id = v_caller;

  if p_skill_ids is not null and array_length(p_skill_ids, 1) > 0 then
    insert into public.profile_skills (profile_id, skill_id)
    select v_caller, unnest(p_skill_ids)
    on conflict do nothing;
  end if;

  if p_sector_ids is not null and array_length(p_sector_ids, 1) > 0 then
    insert into public.profile_sectors (profile_id, sector_id)
    select v_caller, unnest(p_sector_ids)
    on conflict do nothing;
  end if;
end;
$$;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Fix onboarding "You don't have permission to do that"
--
-- Regression introduced by 20260531000003_lock_status_to_role.sql.
--
-- What broke:
--   That migration tightened tg_profiles_protect_status() so a status
--   change is only allowed for service_role, is_admin(), or a caller
--   that has set the transaction-local GUC
--   foundry.onboarding_submission='true'. It then re-added the
--   set_config() call to submit_onboarding -- but re-created the OLD
--   6-arg signature (p_linkedin_url, p_grad_year, p_bio, p_working_on,
--   p_skill_ids, p_sector_ids), which had already been superseded two
--   migrations earlier (20260529000003) by the 9-arg version carrying
--   p_course / p_github_url / p_portfolio_url.
--
--   Because CREATE OR REPLACE FUNCTION keys on the exact argument list,
--   that re-creation did not touch the live 9-arg function -- it
--   resurrected a dead overload. The database ended up with two
--   submit_onboarding functions:
--     * 9-arg  -> the one the frontend actually calls; flips status but
--                 never sets the GUC -> trigger raises 42501
--                 -> "You don't have permission to do that."
--     * 6-arg  -> has the GUC, but nothing calls it.
--
--   This hit BOTH roles (student -> approved, alum -> pending_review),
--   since both go through the same function and trigger.
--
-- Fix:
--   1. Re-create the 9-arg submit_onboarding (verbatim from
--      20260529000003) with the set_config GUC added immediately before
--      the status-flipping UPDATE -- the correction the lock migration
--      intended.
--   2. Drop the orphaned 6-arg overload so no dead/ambiguous version
--      lingers.
--   The trigger from 20260531000003 is correct and is left untouched.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.submit_onboarding(
  p_course        text,
  p_grad_year     int,
  p_linkedin_url  text,
  p_github_url    text,
  p_portfolio_url text,
  p_bio           text,
  p_working_on    text,
  p_skill_ids     smallint[],
  p_sector_ids    smallint[]
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
  v_course     text;
  v_linkedin   text;
  v_github     text;
  v_portfolio  text;
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

  v_course    := nullif(trim(coalesce(p_course,        '')), '');
  v_linkedin  := nullif(trim(coalesce(p_linkedin_url,  '')), '');
  v_github    := nullif(trim(coalesce(p_github_url,    '')), '');
  v_portfolio := nullif(trim(coalesce(p_portfolio_url, '')), '');
  v_bio       := nullif(trim(coalesce(p_bio,           '')), '');
  v_working   := nullif(trim(coalesce(p_working_on,    '')), '');

  if v_course is null then
    raise exception 'Course is required';
  end if;
  if p_grad_year is null then
    raise exception 'Graduation year is required';
  end if;
  if v_role = 'alum' and v_linkedin is null then
    raise exception 'LinkedIn URL is required for alumni';
  end if;

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
     set course        = v_course,
         grad_year     = p_grad_year,
         linkedin_url  = v_linkedin,
         github_url    = v_github,
         portfolio_url = v_portfolio,
         bio           = v_bio,
         working_on    = v_working,
         status        = v_new_status
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

-- Drop the orphaned 6-arg overload resurrected by 20260531000003.
drop function if exists public.submit_onboarding(text, int, text, text, smallint[], smallint[]);

grant execute on function public.submit_onboarding(text, int, text, text, text, text, text, smallint[], smallint[]) to authenticated;

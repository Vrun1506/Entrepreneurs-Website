-- ════════════════════════════════════════════════════════════════════
-- Foundry · Enforce min length on first_name / surname in update_profile
--
-- Frontend validates min 2 chars, but a hand-crafted API call could
-- bypass it. Repeat the check inside the SECURITY DEFINER RPC.
--
-- DB-level CHECK constraints on profiles.first_name / surname are NOT
-- added because the new-user trigger may insert empty strings when an
-- OAuth provider returns no name metadata. The user fixes it via the
-- profile page, where this RPC enforces the floor.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.update_profile(
  p_first_name   text,
  p_surname      text,
  p_linkedin_url text,
  p_github_url   text,
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
  v_caller   uuid := auth.uid();
  v_role     user_role;
  v_first    text;
  v_last     text;
  v_linkedin text;
  v_github   text;
  v_bio      text;
  v_working  text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  v_first    := nullif(trim(coalesce(p_first_name,   '')), '');
  v_last     := nullif(trim(coalesce(p_surname,      '')), '');
  v_linkedin := nullif(trim(coalesce(p_linkedin_url, '')), '');
  v_github   := nullif(trim(coalesce(p_github_url,   '')), '');
  v_bio      := nullif(trim(coalesce(p_bio,          '')), '');
  v_working  := nullif(trim(coalesce(p_working_on,   '')), '');

  if v_first    is null then raise exception 'First name is required';    end if;
  if v_last     is null then raise exception 'Surname is required';       end if;
  if length(v_first) < 2 or length(v_last) < 2 then
    raise exception 'First name and surname must be at least 2 characters';
  end if;
  if length(v_first) > 50 or length(v_last) > 50 then
    raise exception 'First name and surname must be 50 characters or fewer';
  end if;
  if v_linkedin is null then raise exception 'LinkedIn URL is required';  end if;
  if v_role = 'alum' and p_grad_year is null then
    raise exception 'Graduation year is required for alumni';
  end if;

  update public.profiles
     set first_name   = v_first,
         surname      = v_last,
         linkedin_url = v_linkedin,
         github_url   = v_github,
         grad_year    = case when v_role = 'alum' then p_grad_year else null end,
         bio          = v_bio,
         working_on   = v_working
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

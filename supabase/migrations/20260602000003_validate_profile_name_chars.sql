-- ════════════════════════════════════════════════════════════════════
-- Foundry · Reject digits / symbol-soup in first_name / surname
--
-- The frontend now restricts names to letters (any language) + spaces +
-- hyphen / apostrophe / period. Onboarding & profile edits call this RPC
-- directly from the browser, so a hand-crafted call could bypass the
-- client check — repeat it here as the bypass-safe gate.
--
-- IMPLEMENTATION NOTE: this is a *denylist* (reject if the name contains a
-- digit or a forbidden ASCII symbol), NOT a letter whitelist. A whitelist
-- via [[:alpha:]] depends on the DB's LC_CTYPE and could wrongly reject
-- accented / non-Latin names under a C/ICU locale. The denylist never
-- matches a Unicode letter, so "José" / "李四" / "O'Brien" always pass,
-- while "John123" / "x@y" / "a£b" are rejected regardless of locale.
--
-- Only the char check is added; the rest of the body is unchanged from
-- 20260529000002_relax_name_min_length.sql.
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
  if length(v_first) > 50 or length(v_last) > 50 then
    raise exception 'First name and surname must be 50 characters or fewer';
  end if;
  -- Reject digits and symbol-soup. Letters (any script), spaces, hyphens,
  -- apostrophes and periods are absent from this class, so they pass.
  if v_first ~ '[0-9@£$%^&*()+=/{}<>!?#~_;:",|]'
     or v_last ~ '[0-9@£$%^&*()+=/{}<>!?#~_;:",|]' then
    raise exception 'First name and surname can only contain letters, spaces, hyphens, apostrophes and periods';
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

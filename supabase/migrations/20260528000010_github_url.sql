-- ════════════════════════════════════════════════════════════════════
-- Foundry · GitHub URL field
--
-- 1. Nullable github_url column on profiles + CHECK regex.
-- 2. submit_onboarding and update_profile re-declared with p_github_url.
--    Old signatures dropped because Postgres won't let CREATE OR REPLACE
--    change a function's argument list.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists github_url text;

alter table public.profiles
  drop constraint if exists profiles_github_url_format;

alter table public.profiles
  add constraint profiles_github_url_format check (
    github_url is null
    or github_url ~* '^https?://([a-z0-9-]+\.)*github\.com/'
  );

-- ─── submit_onboarding ───────────────────────────────────────────────
drop function if exists public.submit_onboarding(text, int, text, text, smallint[], smallint[]);

create or replace function public.submit_onboarding(
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
  v_caller     uuid := auth.uid();
  v_role       user_role;
  v_status     user_status;
  v_new_status user_status;
  v_linkedin   text;
  v_github     text;
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

  v_github  := nullif(trim(coalesce(p_github_url, '')), '');
  v_bio     := nullif(trim(coalesce(p_bio, '')), '');
  v_working := nullif(trim(coalesce(p_working_on, '')), '');

  v_new_status := case v_role
    when 'alum'    then 'pending_review'::user_status
    when 'student' then 'approved'::user_status
  end;

  update public.profiles
     set linkedin_url = v_linkedin,
         github_url   = v_github,
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

-- ─── update_profile ──────────────────────────────────────────────────
drop function if exists public.update_profile(text, text, text, int, text, text, smallint[], smallint[]);

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

-- ─── Grants ──────────────────────────────────────────────────────────
grant execute on function public.submit_onboarding(text, text, int, text, text, smallint[], smallint[]) to authenticated;
grant execute on function public.update_profile(text, text, text, text, int, text, text, smallint[], smallint[]) to authenticated;

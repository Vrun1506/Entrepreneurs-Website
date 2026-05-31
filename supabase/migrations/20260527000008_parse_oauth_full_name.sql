-- Parse first_name / surname from OAuth providers that only return a full
-- name in raw_user_meta_data.
--
-- Email signups send first_name / surname explicitly via signUp metadata.
-- Microsoft (Azure) tends to send the OIDC standard claims given_name /
-- family_name. Google through Supabase populates only `name` / `full_name`
-- (e.g. "Varun Nayak") — no separate first/last fields.
--
-- Fallback chain for first_name:
--   1. metadata.first_name   (email signup)
--   2. metadata.given_name   (Azure)
--   3. first whitespace-delimited token of name/full_name (Google)
--   4. ''
--
-- Fallback chain for surname:
--   1. metadata.surname
--   2. metadata.family_name
--   3. everything after the first space in name/full_name
--   4. ''
--
-- These are best-effort. Onboarding will let users confirm / correct
-- the parsed values, since "Some Person Jr." or single-name accounts
-- need human review.

create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role       user_role;
  v_provider   text;
  v_domain     text;
  v_full_name  text;
  v_first_name text;
  v_surname    text;
  v_grad_year  int;
begin
  v_provider := new.raw_app_meta_data->>'provider';

  if v_provider = 'azure' then
    v_domain := lower(split_part(new.email, '@', 2));
    if v_domain not in ('ic.ac.uk', 'imperial.ac.uk') then
      raise exception 'Microsoft sign-in is restricted to Imperial College London accounts (@ic.ac.uk or @imperial.ac.uk).';
    end if;
  end if;

  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role', '')::user_role,
    case v_provider
      when 'google' then 'alum'::user_role
      when 'azure'  then 'student'::user_role
      else 'student'::user_role
    end
  );

  v_full_name := nullif(
    trim(coalesce(
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name'
    )),
    ''
  );

  v_first_name := coalesce(
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'given_name', ''),
    case when v_full_name is not null then split_part(v_full_name, ' ', 1) end,
    ''
  );

  v_surname := coalesce(
    nullif(new.raw_user_meta_data->>'surname', ''),
    nullif(new.raw_user_meta_data->>'family_name', ''),
    case
      when v_full_name is not null and position(' ' in v_full_name) > 0
      then trim(substring(v_full_name from position(' ' in v_full_name) + 1))
    end,
    ''
  );

  v_grad_year := nullif(new.raw_user_meta_data->>'grad_year', '')::int;

  insert into public.profiles (id, role, first_name, surname, grad_year)
  values (new.id, v_role, v_first_name, v_surname, v_grad_year);

  return new;
end;
$$;

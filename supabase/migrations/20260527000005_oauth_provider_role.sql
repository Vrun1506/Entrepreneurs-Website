-- Make tg_handle_new_user role-aware for OAuth providers.
--
-- Email signups send role explicitly via signUp metadata, so that path is
-- unchanged. OAuth signups don't — Supabase populates raw_app_meta_data
-- with the provider name, so we use that as the fallback:
--   provider = google → alum   (Google is the alum-signup path)
--   provider = azure  → student
--   anything else     → student (safe default)

create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role       user_role;
  v_provider   text;
  v_first_name text;
  v_surname    text;
  v_grad_year  int;
begin
  v_provider := new.raw_app_meta_data->>'provider';

  v_role := coalesce(
    nullif(new.raw_user_meta_data->>'role', '')::user_role,
    case v_provider
      when 'google' then 'alum'::user_role
      when 'azure'  then 'student'::user_role
      else 'student'::user_role
    end
  );

  v_first_name := coalesce(
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'given_name',
    ''
  );

  v_surname := coalesce(
    new.raw_user_meta_data->>'surname',
    new.raw_user_meta_data->>'family_name',
    ''
  );

  v_grad_year := nullif(new.raw_user_meta_data->>'grad_year', '')::int;

  insert into public.profiles (id, role, first_name, surname, grad_year)
  values (new.id, v_role, v_first_name, v_surname, v_grad_year);

  return new;
end;
$$;

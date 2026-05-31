-- Restrict Microsoft (Azure) OAuth signups to Imperial email domains.
-- The Azure app is configured multitenant (any work/school account can
-- attempt sign-in), so the email-domain gate is enforced at the DB layer
-- inside the new-user trigger. The OAuth callback re-checks as defence
-- in depth for users that pre-date this restriction.
--
-- Allowed domains: ic.ac.uk, imperial.ac.uk (exact match, no subdomains).

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

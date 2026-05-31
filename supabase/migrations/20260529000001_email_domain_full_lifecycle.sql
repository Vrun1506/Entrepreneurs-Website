-- ════════════════════════════════════════════════════════════════════
-- Foundry · Imperial email-domain rule covers the full account lifecycle
--
-- Before this migration, the @ic.ac.uk / @imperial.ac.uk requirement was
-- enforced only on Azure-provider INSERT into auth.users (see 20260527
-- 000006). Two gaps:
--
--   (a) Magic-link / email-password signups marked as students did not
--       re-check the domain at the DB layer — they relied on form-level
--       validation alone, which a hand-crafted API call could bypass.
--   (b) Once signed up, a student could change auth.users.email to a
--       non-Imperial address and keep access.
--
-- The unified rule after this migration:
--
--   "If a profile has role='student', the user's auth email must end in
--    @ic.ac.uk or @imperial.ac.uk — both on creation and on any later
--    change."
--
-- Alumni (role='alum') remain unrestricted.
-- ════════════════════════════════════════════════════════════════════

-- ─── Shared domain check ─────────────────────────────────────────────
create or replace function public.is_imperial_email(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(split_part(coalesce(p_email, ''), '@', 2))
         in ('ic.ac.uk', 'imperial.ac.uk');
$$;

-- ─── Updated INSERT trigger ──────────────────────────────────────────
-- Same shape as 20260527000008, but the domain gate is now keyed off
-- the resolved role rather than the provider. Covers magic-link signup
-- (defence in depth) without breaking the alumni email-password flow.
create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role       user_role;
  v_provider   text;
  v_full_name  text;
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

  if v_role = 'student' and not public.is_imperial_email(new.email) then
    raise exception 'Student accounts must use an @imperial.ac.uk or @ic.ac.uk email address.';
  end if;

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

-- ─── New BEFORE UPDATE trigger on auth.users ─────────────────────────
-- Fires only when the email column is touched. Looks up the profile
-- role and re-applies the Imperial domain check for students.
create or replace function public.tg_auth_users_protect_email_domain()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role user_role;
begin
  -- No-op if email isn't actually changing.
  if new.email is not distinct from old.email then
    return new;
  end if;

  select role into v_role from public.profiles where id = new.id;

  -- No profile yet means signup is still in flight; the INSERT trigger
  -- handles enforcement in that path. Allowing here avoids breaking
  -- legitimate intra-transaction updates during account creation.
  if not found then
    return new;
  end if;

  if v_role = 'student' and not public.is_imperial_email(new.email) then
    raise exception 'Student accounts must keep an @imperial.ac.uk or @ic.ac.uk email address.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  before update of email on auth.users
  for each row execute function public.tg_auth_users_protect_email_domain();

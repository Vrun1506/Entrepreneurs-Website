-- ════════════════════════════════════════════════════════════════════
-- Foundry · Admission tests for the six-role enum
--
-- role decides admission, so extending the enum from two values to six is
-- a security change, not a taxonomy change. This file asserts the one
-- property that must hold no matter how many roles exist:
--
--   ONLY a student with a verified Imperial address reaches 'approved'
--   without an admin. Everything else lands in 'pending_review'.
--
-- Run against a fresh local stack:
--   supabase db reset
--   docker exec -i supabase_db_<project> psql -U postgres -d postgres \
--     -f - < supabase/tests/admission_roles.sql
--
-- Same conventions as rls_smoke.sql: seed as a faked service_role claim,
-- then act as the user by setting the sub claim. Plain assertions.
-- ════════════════════════════════════════════════════════════════════

begin;

set local role postgres;

do $$
declare
  r            record;
  v_id         uuid;
  v_status     user_status;
  v_year       int;
  v_linkedin   text;
  v_expected   user_status;
  v_current    int := extract(year from now())::int;
  v_failures   int := 0;
begin
  -- ─── One account per role, each submitting a valid form ───────────
  for r in
    select * from (values
      ('student',       'imperial.ac.uk', 'approved'),
      ('recent_grad',   'gmail.com',      'pending_review'),
      ('alum',          'gmail.com',      'pending_review'),
      ('mentor',        'gmail.com',      'pending_review'),
      ('angel',         'gmail.com',      'pending_review'),
      ('staff_faculty', 'gmail.com',      'pending_review')
    ) as t(role_name, domain, expected)
  loop
    v_id       := gen_random_uuid();
    v_expected := r.expected::user_status;

    -- Graduation year: future for a student, past for the two graduated
    -- roles, absent for the three that never had one.
    v_year := case r.role_name
      when 'student'     then v_current + 2
      when 'recent_grad' then v_current - 1
      when 'alum'        then v_current - 5
      else null
    end;

    -- LinkedIn stands in for the Imperial address every non-student lacks.
    v_linkedin := case when r.role_name = 'student'
      then null else 'https://linkedin.com/in/test' end;

    perform set_config('request.jwt.claims',
      json_build_object('role', 'service_role')::text, true);

    -- tg_handle_new_user reads `role` straight out of the signup metadata
    -- and casts it to user_role, so this is the same path a real signup
    -- takes. It enforces the Imperial-address rule for 'student' only.
    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_id, r.role_name || '@' || r.domain,
            json_build_object('first_name', 'T', 'surname', 'User',
                              'role', r.role_name)::jsonb,
            '{"provider":"email"}'::jsonb)
    on conflict do nothing;

    insert into public.profiles (id, role, status, first_name, surname)
    values (v_id, r.role_name::user_role, 'pending_onboarding', 'T', 'User')
    on conflict (id) do update set
      role   = excluded.role,
      status = excluded.status;

    -- Act as the member.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);

    perform public.submit_onboarding(
      'MEng Computing', v_year, v_linkedin, null, null,
      'A bio', 'Working on things', null, null);

    perform set_config('request.jwt.claims',
      json_build_object('role', 'service_role')::text, true);

    select status into v_status from public.profiles where id = v_id;

    if v_status is distinct from v_expected then
      raise warning 'FAIL % → status % (expected %)', r.role_name, v_status, v_expected;
      v_failures := v_failures + 1;
    else
      raise notice 'ok   % → %', r.role_name, v_status;
    end if;
  end loop;

  if v_failures > 0 then
    raise exception '% admission assertion(s) failed', v_failures;
  end if;
end;
$$;

-- ─── A student on a non-Imperial address must NOT auto-approve ───────
do $$
declare
  v_id  uuid := gen_random_uuid();
  v_ok  boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);

  -- Sign up as an angel, which carries no domain requirement and so gets
  -- past tg_handle_new_user, then flip the role to student as
  -- service_role. This is the state a successful role escalation would
  -- leave behind, and the point of the test is that submit_onboarding is
  -- a SECOND line of defence that still refuses it.
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id, 'sneaky@gmail.com',
          '{"first_name":"S","surname":"Neaky","role":"angel"}'::jsonb,
          '{"provider":"email"}'::jsonb)
  on conflict do nothing;

  insert into public.profiles (id, role, status, first_name, surname)
  values (v_id, 'student', 'pending_onboarding', 'S', 'Neaky')
  on conflict (id) do update set role = excluded.role, status = excluded.status;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);

  begin
    perform public.submit_onboarding(
      'MEng Computing', extract(year from now())::int + 2,
      null, null, null, 'bio', 'working', null, null);
  exception when others then
    v_ok := true;
    raise notice 'ok   non-Imperial student rejected: %', sqlerrm;
  end;

  if not v_ok then
    raise exception 'FAIL non-Imperial student was allowed through submit_onboarding';
  end if;
end;
$$;

-- ─── The role lock still holds against a direct UPDATE ───────────────
do $$
declare
  v_id uuid := gen_random_uuid();
  v_ok boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);

  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id, 'climber@gmail.com',
          '{"first_name":"C","surname":"Limber","role":"angel"}'::jsonb,
          '{"provider":"email"}'::jsonb)
  on conflict do nothing;

  insert into public.profiles (id, role, status, first_name, surname)
  values (v_id, 'angel', 'pending_onboarding', 'C', 'Limber')
  on conflict (id) do update set role = excluded.role, status = excluded.status;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);

  begin
    update public.profiles set role = 'student' where id = v_id;
  exception when others then
    v_ok := true;
    raise notice 'ok   role escalation rejected: %', sqlerrm;
  end;

  if not v_ok then
    raise exception 'FAIL an angel escalated themselves to student';
  end if;
end;
$$;

-- ─── avatar_path is not user-writable ────────────────────────────────
do $$
declare
  v_id uuid := gen_random_uuid();
  v_ok boolean := false;
begin
  perform set_config('request.jwt.claims',
    json_build_object('role', 'service_role')::text, true);

  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id, 'painter@imperial.ac.uk',
          '{"first_name":"P","surname":"Ainter"}'::jsonb,
          '{"provider":"email"}'::jsonb)
  on conflict do nothing;

  -- Approved rows must satisfy the course/grad_year constraints.
  insert into public.profiles (id, role, status, first_name, surname, course, grad_year)
  values (v_id, 'student', 'approved', 'P', 'Ainter', 'MEng Computing',
          extract(year from now())::int + 2)
  on conflict (id) do update set
    role = excluded.role, status = excluded.status,
    course = excluded.course, grad_year = excluded.grad_year;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);

  begin
    update public.profiles set avatar_path = 'avatars/someone-elses.jpg' where id = v_id;
  exception when others then
    v_ok := true;
    raise notice 'ok   avatar_path write rejected: %', sqlerrm;
  end;

  if not v_ok then
    raise exception 'FAIL avatar_path was user-writable';
  end if;
end;
$$;

rollback;

-- ════════════════════════════════════════════════════════════════════
-- set_my_affiliation — self-service, but never in or out of 'student'
-- ════════════════════════════════════════════════════════════════════

begin;
set local role postgres;

do $$
declare
  r          record;
  v_id       uuid;
  v_after    user_role;
  v_failures int := 0;
  v_err      text;
begin
  -- from_role, to_role, should_succeed
  for r in
    select * from (values
      ('alum',          'angel',         true ),
      ('alum',          'mentor',        true ),
      ('mentor',        'staff_faculty', true ),
      ('recent_grad',   'mentor',        true ),
      ('recent_grad',   'alum',          true ),
      -- The two that must never work.
      ('alum',          'student',       false),
      ('angel',         'student',       false)
    ) as t(from_role, to_role, ok)
  loop
    v_id := gen_random_uuid();

    perform set_config('request.jwt.claims',
      json_build_object('role','service_role')::text, true);

    insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_id, r.from_role || '-to-' || r.to_role || '@gmail.com',
            json_build_object('first_name','M','surname','Over','role',r.from_role)::jsonb,
            '{"provider":"email"}'::jsonb);

    -- Graduated roles carry a year; the other three must not.
    insert into public.profiles (id, role, status, first_name, surname, course, grad_year)
    values (v_id, r.from_role::user_role, 'approved', 'M', 'Over', 'MEng Computing',
            case when r.from_role in ('alum','recent_grad')
                 then extract(year from now())::int - 2 end)
    on conflict (id) do update set
      role = excluded.role, status = excluded.status,
      course = excluded.course, grad_year = excluded.grad_year;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);

    v_err := null;
    begin
      perform public.set_my_affiliation(r.to_role::user_role);
    exception when others then
      v_err := sqlerrm;
    end;

    perform set_config('request.jwt.claims',
      json_build_object('role','service_role')::text, true);
    select role into v_after from public.profiles where id = v_id;

    if r.ok and (v_err is not null or v_after <> r.to_role::user_role) then
      raise warning 'FAIL % → % should have worked (err=%, role now %)',
        r.from_role, r.to_role, v_err, v_after;
      v_failures := v_failures + 1;
    elsif not r.ok and (v_err is null or v_after = r.to_role::user_role) then
      raise warning 'FAIL % → % should have been refused (role now %)',
        r.from_role, r.to_role, v_after;
      v_failures := v_failures + 1;
    else
      raise notice 'ok   % → % %', r.from_role, r.to_role,
        case when r.ok then '(allowed)' else '(refused)' end;
    end if;
  end loop;

  if v_failures > 0 then
    raise exception '% affiliation-change assertion(s) failed', v_failures;
  end if;
end;
$$;

-- A student may not move out, even to a role that needs no verification.
do $$
declare v_id uuid := gen_random_uuid(); v_ok boolean := false; v_after user_role;
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id,'staying@imperial.ac.uk','{"first_name":"S","surname":"Tay"}'::jsonb,'{"provider":"email"}'::jsonb);
  insert into public.profiles (id, role, status, first_name, surname, course, grad_year)
  values (v_id,'student','approved','S','Tay','MEng Computing', extract(year from now())::int + 2)
  on conflict (id) do update set role = excluded.role, status = excluded.status,
    course = excluded.course, grad_year = excluded.grad_year;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text,'role','authenticated')::text, true);
  begin
    perform public.set_my_affiliation('alum');
  exception when others then
    v_ok := true;
    raise notice 'ok   student → alum refused: %', sqlerrm;
  end;

  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  select role into v_after from public.profiles where id = v_id;
  if not v_ok or v_after <> 'student' then
    raise exception 'FAIL a student changed their own affiliation (now %)', v_after;
  end if;
end;
$$;

-- Moving to a graduated role with no year on file must say so, not fail
-- the CHECK constraint with something nobody can act on.
do $$
declare v_id uuid := gen_random_uuid(); v_err text;
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id,'noyear@gmail.com','{"first_name":"N","surname":"Year","role":"angel"}'::jsonb,'{"provider":"email"}'::jsonb);
  insert into public.profiles (id, role, status, first_name, surname, course)
  values (v_id,'angel','approved','N','Year','MEng Computing')
  on conflict (id) do update set role = excluded.role, status = excluded.status,
    course = excluded.course;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text,'role','authenticated')::text, true);
  begin
    perform public.set_my_affiliation('alum');
    raise exception 'FAIL angel with no grad_year was allowed to become an alum';
  exception when others then
    v_err := sqlerrm;
  end;
  if v_err not like '%graduation year%' then
    raise exception 'FAIL unhelpful error for missing grad_year: %', v_err;
  end if;
  raise notice 'ok   missing grad_year refused with an actionable message';
end;
$$;

-- The GUC must not leak: a plain UPDATE is still refused afterwards.
do $$
declare v_id uuid := gen_random_uuid(); v_ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id,'leak@gmail.com','{"first_name":"L","surname":"Eak","role":"alum"}'::jsonb,'{"provider":"email"}'::jsonb);
  insert into public.profiles (id, role, status, first_name, surname, course, grad_year)
  values (v_id,'alum','approved','L','Eak','MEng Computing', extract(year from now())::int - 3)
  on conflict (id) do update set role = excluded.role, status = excluded.status,
    course = excluded.course, grad_year = excluded.grad_year;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text,'role','authenticated')::text, true);
  perform public.set_my_affiliation('mentor');          -- legitimate call
  begin
    update public.profiles set role = 'student' where id = v_id;  -- must still fail
  exception when others then
    v_ok := true;
    raise notice 'ok   direct role UPDATE still refused after a legitimate change';
  end;
  if not v_ok then
    raise exception 'FAIL the affiliation-change GUC leaked to a later statement';
  end if;
end;
$$;

-- The same leak, on the other function that raises a GUC.
-- submit_onboarding raised foundry.onboarding_submission and never lowered
-- it until 20260828000005. After a legitimate submission, a direct status
-- UPDATE in the same transaction must still be refused.
do $$
declare v_id uuid := gen_random_uuid(); v_ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_id,'gucsub@gmail.com','{"first_name":"G","surname":"Uc","role":"alum"}'::jsonb,'{"provider":"email"}'::jsonb);
  insert into public.profiles (id, role, status, first_name, surname)
  values (v_id,'alum','pending_onboarding','G','Uc')
  on conflict (id) do update set role = excluded.role, status = excluded.status;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text,'role','authenticated')::text, true);
  -- An alum, deliberately: a student would land on 'approved' and the
  -- escalation below would then be a no-op UPDATE the trigger never sees,
  -- which is how the first draft of this test passed against broken code.
  perform public.submit_onboarding(
    'MEng Computing', extract(year from now())::int - 3,
    'https://www.linkedin.com/in/guc', null, null, null, null, null, null);

  begin
    update public.profiles set status = 'approved' where id = v_id;  -- must still fail
  exception when others then
    v_ok := true;
    raise notice 'ok   direct status UPDATE still refused after submit_onboarding';
  end;
  if not v_ok then
    raise exception 'FAIL the onboarding-submission GUC leaked to a later statement';
  end if;
end;
$$;

rollback;

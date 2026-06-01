-- ════════════════════════════════════════════════════════════════════
-- Foundry · RLS smoke tests
--
-- Run against a fresh local Supabase (`supabase db reset`) before each
-- production deploy. Asserts the high-impact RLS policies behave as
-- expected. Plain assertions via `do $$ ... raise exception ... $$;`
-- — no test framework needed.
--
-- The pattern: insert seed rows as service_role, then switch to
-- authenticated with a faked sub claim and verify that what the policy
-- *should* let through is visible, and what it *shouldn't* is not.
--
-- Usage:
--   psql "$DATABASE_URL" -f supabase/tests/rls_smoke.sql
-- ════════════════════════════════════════════════════════════════════

begin;

-- ─── Seed: two student-ish profiles, two listings, one admin ────────
set local role postgres;

do $$
declare
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
  v_opp_a  uuid := gen_random_uuid();
  v_opp_b  uuid := gen_random_uuid();
begin
  -- Seed as service_role. The *_protect_status triggers fire BEFORE UPDATE
  -- and reject any status change that isn't service_role / is_admin() / the
  -- onboarding GUC. The auth.users inserts below trip the auto-create-profile
  -- trigger, so the profiles upsert lands on its DO UPDATE branch (a status
  -- change) and is otherwise rejected. Faking the service_role JWT claim is
  -- the bypass this file always intended (see header note).
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

  -- Pretend auth.users rows exist for these UUIDs. The real GoTrue
  -- service inserts them; in tests we bypass.
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values
    (v_user_a, 'a@imperial.ac.uk', '{"first_name":"A","surname":"User","role":"student"}'::jsonb, '{"provider":"email"}'::jsonb),
    (v_user_b, 'b@imperial.ac.uk', '{"first_name":"B","surname":"User","role":"student"}'::jsonb, '{"provider":"email"}'::jsonb),
    (v_admin,  'admin@imperial.ac.uk', '{"first_name":"Ad","surname":"Min","role":"student"}'::jsonb, '{"provider":"email"}'::jsonb)
  on conflict do nothing;

  -- The new-user trigger inserts profiles, but if it didn't fire (test
  -- bypass), insert them directly.
  insert into public.profiles (id, role, status, first_name, surname, course, grad_year)
  values
    (v_user_a, 'student', 'approved', 'A', 'User', 'MEng Computing', 2027),
    (v_user_b, 'student', 'approved', 'B', 'User', 'BSc Maths',      2026),
    (v_admin,  'student', 'approved', 'Ad','Min',  'MSc Physics',    2025)
  on conflict (id) do update set
    status     = excluded.status,
    course     = excluded.course,
    grad_year  = excluded.grad_year;

  insert into public.admins (user_id) values (v_admin) on conflict do nothing;

  -- A pending opportunity owned by A, an approved one owned by B.
  -- approved_at / approved_by must be set inline: the opportunities_approval_metadata
  -- CHECK rejects an 'approved' row with null approval metadata, so we can't insert
  -- approved-then-backfill -- the per-row CHECK fires at insert time.
  insert into public.opportunities (
    id, posted_by, status, position_name, company, pay, location_type,
    description, start_month, start_year, application_deadline,
    contact_email, apply_method, approved_at, approved_by
  ) values
    (v_opp_a, v_user_a, 'pending',
     'A''s role', 'Co', '£50k', 'remote',
     'Description that is at least twenty chars long.',
     1, 2027, current_date + 30,
     'a@imperial.ac.uk', 'email', null, null),
    (v_opp_b, v_user_b, 'approved',
     'B''s approved role', 'Co', '£50k', 'remote',
     'Description that is at least twenty chars long.',
     1, 2027, current_date + 30,
     'b@imperial.ac.uk', 'email', now(), v_admin);

  -- Stash UUIDs so the test blocks below can find them.
  create temporary table _test_ctx (k text, v uuid);
  insert into _test_ctx (k, v) values
    ('user_a', v_user_a), ('user_b', v_user_b), ('admin', v_admin),
    ('opp_a', v_opp_a), ('opp_b', v_opp_b);
  -- Test bodies switch to the authenticated role so RLS applies, and that
  -- role leaks into later do-blocks (set_config is transaction-local). Grant
  -- _test_ctx so fixture lookups in those blocks' DECLARE sections still work.
  grant select on _test_ctx to authenticated;
end;
$$;

-- ─── Helper: switch to authenticated with a faked JWT sub ───────────
-- Supabase RLS reads auth.uid() from the JWT. We can fake it by setting
-- request.jwt.claims directly.
create or replace function _set_caller(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
end;
$$;

-- ─── Tests ──────────────────────────────────────────────────────────

-- 1. User A can read their own pending listing.
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');
  v_opa uuid := (select v from _test_ctx where k='opp_a');
  v_seen int;
begin
  perform _set_caller(v_a);
  select count(*) into v_seen from public.opportunities where id = v_opa;
  if v_seen <> 1 then raise exception 'FAIL: user A cannot read own pending listing'; end if;
end;
$$;

-- 2. User A *cannot* read user B's pending listing.
--    (B's opp is approved though, so use a separate pending row.)
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');
  v_b   uuid := (select v from _test_ctx where k='user_b');
  v_new uuid := gen_random_uuid();
  v_seen int;
begin
  -- 'none' resets to the login superuser; the leaked authenticated role
  -- can't SET ROLE postgres (it isn't a member of it).
  set local role none;
  insert into public.opportunities (
    id, posted_by, status, position_name, company, pay, location_type,
    description, start_month, start_year, application_deadline,
    contact_email, apply_method
  ) values (
    v_new, v_b, 'pending',
    'B''s pending', 'Co', '£50k', 'remote',
    'Description that is at least twenty chars long.',
    1, 2027, current_date + 30,
    'b@imperial.ac.uk', 'email'
  );

  perform _set_caller(v_a);
  select count(*) into v_seen from public.opportunities where id = v_new;
  if v_seen <> 0 then raise exception 'FAIL: user A could read user B''s pending listing'; end if;
end;
$$;

-- 3. User A *cannot* update user B's approved listing (bait-and-switch
--    attempt).
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');
  v_opb uuid := (select v from _test_ctx where k='opp_b');
  v_count int;
begin
  perform _set_caller(v_a);
  update public.opportunities
     set position_name = 'HIJACKED'
   where id = v_opb;
  get diagnostics v_count = ROW_COUNT;
  if v_count <> 0 then raise exception 'FAIL: user A updated user B''s approved listing (% rows)', v_count; end if;
end;
$$;

-- 4. User A *cannot* update their own approved listing either (bait-
--    and-switch on own row).
do $$
declare
  v_b   uuid := (select v from _test_ctx where k='user_b');
  v_opb uuid := (select v from _test_ctx where k='opp_b');
  v_count int;
begin
  perform _set_caller(v_b);
  update public.opportunities
     set position_name = 'HIJACKED-OWN'
   where id = v_opb;
  get diagnostics v_count = ROW_COUNT;
  if v_count <> 0 then raise exception 'FAIL: user B updated own approved listing (% rows)', v_count; end if;
end;
$$;

-- 5. User A *can* update their own pending listing.
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');
  v_opa uuid := (select v from _test_ctx where k='opp_a');
  v_count int;
begin
  perform _set_caller(v_a);
  update public.opportunities
     set position_name = 'Edited title'
   where id = v_opa;
  get diagnostics v_count = ROW_COUNT;
  if v_count <> 1 then raise exception 'FAIL: user A could not edit own pending listing (% rows)', v_count; end if;
end;
$$;

-- 6. Non-admins cannot read the admins table.
do $$
declare
  v_a uuid := (select v from _test_ctx where k='user_a');
  v_seen int;
begin
  perform _set_caller(v_a);
  select count(*) into v_seen from public.admins;
  if v_seen <> 0 then raise exception 'FAIL: non-admin user A could read public.admins'; end if;
end;
$$;

-- 7. Profile status can be changed by an admin but not by the owner.
do $$
declare
  v_a uuid := (select v from _test_ctx where k='user_a');
  v_count int;
begin
  perform _set_caller(v_a);
  begin
    update public.profiles set status = 'rejected' where id = v_a;
    raise exception 'FAIL: user A flipped own profile status without admin context';
  exception
    when sqlstate '42501' then null;  -- expected
  end;
end;
$$;

-- 8. A pending_onboarding user CAN complete onboarding via the RPC.
--    Regression test for the 20260531000003 signature mismatch, where
--    the status-protect trigger required a GUC that the live 9-arg
--    submit_onboarding never set -> every submission failed with 42501
--    ("You don't have permission to do that") for students and alumni
--    alike. Asserts the student path flips pending_onboarding ->
--    approved through the RPC without error.
do $$
declare
  v_new uuid := gen_random_uuid();
  v_status user_status;
begin
  set local role none;  -- reset to the login superuser (see test 2)
  -- Re-assert the service_role seed bypass: prior tests overwrote the JWT
  -- claim via _set_caller, so the upsert below would otherwise be rejected.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_new, 'onboard@imperial.ac.uk',
          '{"first_name":"On","surname":"Board","role":"student"}'::jsonb,
          '{"provider":"email"}'::jsonb)
  on conflict do nothing;
  insert into public.profiles (id, role, status, first_name, surname)
  values (v_new, 'student', 'pending_onboarding', 'On', 'Board')
  on conflict (id) do update set status = excluded.status;

  perform _set_caller(v_new);
  perform public.submit_onboarding(
    p_course        => 'MEng Computing',
    p_grad_year     => 2028,
    p_linkedin_url  => null,
    p_github_url    => null,
    p_portfolio_url => null,
    p_bio           => null,
    p_working_on    => null,
    p_skill_ids     => null,
    p_sector_ids    => null
  );

  set local role none;  -- reset to the login superuser to read back status
  select status into v_status from public.profiles where id = v_new;
  if v_status <> 'approved' then
    raise exception 'FAIL: student onboarding did not approve (status=%)', v_status;
  end if;
  -- Don't leak the trusted-call GUC into later tests.
  perform set_config('foundry.onboarding_submission', '', true);
end;
$$;

-- ─── Cleanup ────────────────────────────────────────────────────────
drop function _set_caller(uuid);
rollback;

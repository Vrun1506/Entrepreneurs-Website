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

-- 9. get_my_listing_stats counts clicks by DISTINCT viewer, not raw events.
--    Regression test for 20260602000001: record_listing_event lets any
--    authenticated user insert unlimited click events for any listing_id, so
--    count(*) let one member arbitrarily inflate the click total the poster
--    sees on /my-submissions. Here user B fires 3 clicks and the admin fires
--    1 on user A's listing (4 raw events, 2 distinct viewers). Owner A must
--    see click_count = 2. Under the old count(*) this would be 4.
do $$
declare
  v_a    uuid := (select v from _test_ctx where k='user_a');
  v_b    uuid := (select v from _test_ctx where k='user_b');
  v_adm  uuid := (select v from _test_ctx where k='admin');
  v_opa  uuid := (select v from _test_ctx where k='opp_a');
  v_clicks int;
begin
  -- User B clicks through three times (e.g. apply, then contact, then apply).
  perform _set_caller(v_b);
  perform public.record_listing_event('opportunity', v_opa, 'apply_click');
  perform public.record_listing_event('opportunity', v_opa, 'contact_click');
  perform public.record_listing_event('opportunity', v_opa, 'apply_click');

  -- A second distinct viewer (admin) clicks once.
  perform _set_caller(v_adm);
  perform public.record_listing_event('opportunity', v_opa, 'external_click');

  -- Owner A reads their stats: 4 raw click events, 2 distinct viewers.
  perform _set_caller(v_a);
  select click_count into v_clicks
    from public.get_my_listing_stats()
   where listing_id = v_opa;
  if v_clicks is distinct from 2 then
    raise exception 'FAIL: click_count = % (expected 2 distinct viewers; count(*) would give 4)', v_clicks;
  end if;
end;
$$;

-- 10. A user cannot change their own role.
--     Regression test for 20260603000001: profiles.role was user-writable
--     via profiles_update_own, so an alum could flip to 'student' and
--     self-approve through submit_onboarding's role→status map. The
--     role-protect trigger now rejects any non-admin / non-service role
--     change.
do $$
declare
  v_a uuid := (select v from _test_ctx where k='user_a');  -- a student
begin
  perform _set_caller(v_a);
  begin
    update public.profiles set role = 'alum' where id = v_a;
    raise exception 'FAIL: user A changed own role without admin context';
  exception
    when sqlstate '42501' then null;  -- expected: role-protect trigger
  end;
end;
$$;

-- 11. submit_onboarding re-checks the Imperial domain for students.
--     A student whose auth email is non-Imperial (only reachable via a
--     role flip after an alum-style Google signup) cannot self-approve.
do $$
declare
  v_new uuid := gen_random_uuid();
  v_cy  int  := extract(year from now())::int;
begin
  set local role none;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_new, 'sneaky@gmail.com',
          '{"first_name":"Sn","surname":"Eaky","role":"alum"}'::jsonb,
          '{"provider":"google"}'::jsonb)
  on conflict do nothing;
  -- Flip alum→student + pending_onboarding as service_role (allowed by the
  -- protect triggers). The auth email stays non-Imperial.
  update public.profiles
     set role = 'student', status = 'pending_onboarding'
   where id = v_new;

  perform _set_caller(v_new);
  begin
    perform public.submit_onboarding(
      p_course        => 'MEng Computing',
      p_grad_year     => v_cy + 1,
      p_linkedin_url  => null,
      p_github_url    => null,
      p_portfolio_url => null,
      p_bio           => null,
      p_working_on    => null,
      p_skill_ids     => null,
      p_sector_ids    => null
    );
    raise exception 'FAIL: non-Imperial student completed onboarding';
  exception
    when sqlstate '42501' then null;  -- expected: domain re-check
  end;
  perform set_config('foundry.onboarding_submission', '', true);
end;
$$;

-- 12. Students must pick a future graduation year (>= current_year + 1).
do $$
declare
  v_new uuid := gen_random_uuid();
  v_cy  int  := extract(year from now())::int;
begin
  set local role none;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_new, 'stud12@imperial.ac.uk',
          '{"first_name":"St","surname":"Ud","role":"student"}'::jsonb,
          '{"provider":"email"}'::jsonb)
  on conflict do nothing;
  insert into public.profiles (id, role, status, first_name, surname)
  values (v_new, 'student', 'pending_onboarding', 'St', 'Ud')
  on conflict (id) do update set status = excluded.status;

  perform _set_caller(v_new);
  begin
    perform public.submit_onboarding(
      p_course        => 'MEng Computing',
      p_grad_year     => v_cy,          -- not in the future → rejected
      p_linkedin_url  => null,
      p_github_url    => null,
      p_portfolio_url => null,
      p_bio           => null,
      p_working_on    => null,
      p_skill_ids     => null,
      p_sector_ids    => null
    );
    raise exception 'FAIL: student set a non-future graduation year';
  exception
    when sqlstate '22023' then null;  -- expected: grad-year bound
  end;
  perform set_config('foundry.onboarding_submission', '', true);
end;
$$;

-- 13. Alumni cannot set a future graduation year (> current_year).
do $$
declare
  v_new uuid := gen_random_uuid();
  v_cy  int  := extract(year from now())::int;
begin
  set local role none;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
  values (v_new, 'alum13@gmail.com',
          '{"first_name":"Al","surname":"Um","role":"alum"}'::jsonb,
          '{"provider":"google"}'::jsonb)
  on conflict do nothing;
  insert into public.profiles (id, role, status, first_name, surname, course, grad_year, linkedin_url)
  values (v_new, 'alum', 'approved', 'Al', 'Um', 'MEng', v_cy - 1, 'https://linkedin.com/in/alum13')
  on conflict (id) do update set
    status       = excluded.status,
    role         = excluded.role,
    course       = excluded.course,
    grad_year    = excluded.grad_year,
    linkedin_url = excluded.linkedin_url;

  perform _set_caller(v_new);
  begin
    perform public.update_profile(
      p_first_name    => 'Al',
      p_surname       => 'Um',
      p_course        => 'MEng',
      p_grad_year     => v_cy + 1,       -- future → rejected for alumni
      p_linkedin_url  => 'https://linkedin.com/in/alum13',
      p_github_url    => null,
      p_portfolio_url => null,
      p_bio           => null,
      p_working_on    => null,
      p_skill_ids     => null,
      p_sector_ids    => null
    );
    raise exception 'FAIL: alum set a future graduation year';
  exception
    when sqlstate '22023' then null;  -- expected: grad-year bound
  end;
end;
$$;

-- 14. A non-admin cannot INSERT an event already flagged as a society
--     event (impersonating an official event). The flag-protect trigger
--     (20260603000002) rejects it.
do $$
declare
  v_a uuid := (select v from _test_ctx where k='user_a');
begin
  perform _set_caller(v_a);
  begin
    insert into public.events (
      posted_by, status, title, description, luma_link,
      event_at, location, organiser_name, contact_email, is_society_event
    ) values (
      v_a, 'pending', 'Fake society night',
      'Description that is at least twenty chars long.',
      'https://lu.ma/x', now() + interval '7 days', 'Imperial',
      'A User', 'a@imperial.ac.uk', true
    );
    raise exception 'FAIL: non-admin inserted a society event';
  exception
    when sqlstate '42501' then null;  -- expected: flag-protect trigger
  end;
end;
$$;

-- 15. A non-admin cannot UPDATE their own pending event to set the
--     society flag (the user edit path is a direct PostgREST UPDATE).
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');
  v_evt uuid := gen_random_uuid();
begin
  -- Seed an ordinary (external) pending event owned by A, as service_role.
  set local role none;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  insert into public.events (
    id, posted_by, status, title, description, luma_link,
    event_at, location, organiser_name, contact_email
  ) values (
    v_evt, v_a, 'pending', 'A''s external event',
    'Description that is at least twenty chars long.',
    'https://lu.ma/x', now() + interval '7 days', 'Imperial',
    'A User', 'a@imperial.ac.uk'
  );

  perform _set_caller(v_a);
  begin
    update public.events set is_society_event = true where id = v_evt;
    raise exception 'FAIL: non-admin set the society flag via update';
  exception
    when sqlstate '42501' then null;  -- expected: flag-protect trigger
  end;
end;
$$;

-- 16. admin_create_event with p_is_society_event => true publishes an
--     approved society event, and the flag persists.
do $$
declare
  v_adm uuid := (select v from _test_ctx where k='admin');
  v_new uuid;
  v_flag boolean;
  v_status user_status;
begin
  perform _set_caller(v_adm);
  v_new := public.admin_create_event(
    p_title                 => 'Official Demo Day',
    p_description           => 'Description that is at least twenty chars long.',
    p_luma_link             => 'https://lu.ma/official',
    p_event_at              => now() + interval '14 days',
    p_location              => 'Imperial',
    p_organiser_name        => 'Imperial Entrepreneurs',
    p_contact_email         => 'admin@imperial.ac.uk',
    p_contact_email_visible => false,
    p_is_society_event      => true
  );

  set local role none;  -- read back as the owner
  select is_society_event, status into v_flag, v_status
    from public.events where id = v_new;
  if v_flag is not true then
    raise exception 'FAIL: admin_create_event did not persist the society flag';
  end if;
  if v_status <> 'approved' then
    raise exception 'FAIL: admin_create_event did not auto-approve (status=%)', v_status;
  end if;
end;
$$;

-- 17. submit_event (the member path) produces an EXTERNAL event
--     (is_society_event = false), with no way to opt in.
do $$
declare
  v_b   uuid := (select v from _test_ctx where k='user_b');
  v_new uuid;
  v_flag boolean;
begin
  perform _set_caller(v_b);
  v_new := public.submit_event(
    p_title                 => 'Member meetup',
    p_description           => 'Description that is at least twenty chars long.',
    p_luma_link             => 'https://lu.ma/member',
    p_event_at              => now() + interval '10 days',
    p_location              => 'Online',
    p_organiser_name        => 'B User',
    p_contact_email         => 'b@imperial.ac.uk',
    p_contact_email_visible => false
  );

  set local role none;  -- read back as the owner
  select is_society_event into v_flag from public.events where id = v_new;
  if v_flag is distinct from false then
    raise exception 'FAIL: submit_event produced a non-external event (flag=%)', v_flag;
  end if;
end;
$$;

-- 18. No dead RPC overloads. A `CREATE OR REPLACE FUNCTION` with a drifted
--     signature doesn't replace the old function — it creates a SECOND
--     overload, and the stale one keeps answering. supabase-js `.rpc(name)`
--     calls by name only and can't disambiguate, so ANY duplicate public
--     function name is a latent bug (PostgREST errors with "could not choose
--     the best candidate function"). This guard makes that loud. Extension-
--     owned functions (pgcrypto et al. legitimately overload) are excluded.
set local role postgres;
do $$
declare
  v_dupes text;
begin
  select string_agg(format('%s (%s overloads)', proname, cnt), ', ')
  into v_dupes
  from (
    select p.proname, count(*) as cnt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'  -- skip extension-owned funcs
      )
    group by p.proname
    having count(*) > 1
  ) dupes;

  if v_dupes is not null then
    raise exception
      'FAIL: public function(s) have multiple overloads (supabase-js .rpc() cannot disambiguate — likely a dead CREATE OR REPLACE signature drift): %',
      v_dupes;
  end if;
end;
$$;

-- 19. A non-admin cannot call ANY admin-only RPC. These are SECURITY DEFINER
--     (they bypass RLS by design), so their ONLY gate is the internal
--     is_admin() check, which raises 'Forbidden' with SQLSTATE 42501. This is
--     the "can't reach admin endpoints" guarantee. We assert each raises 42501;
--     a silent success (or any other error) fails the test loudly.
--     `perform * from f(...)` works for both void- and table-returning RPCs.
set local role postgres;
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');  -- non-admin
  v_b   uuid := (select v from _test_ctx where k='user_b');
  v_opa uuid := (select v from _test_ctx where k='opp_a');
begin
  perform _set_caller(v_a);

  begin
    perform * from public.approve_user(v_b, null);
    raise exception 'FAIL: non-admin called approve_user without being blocked';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform * from public.reject_user(v_b, 'spam');
    raise exception 'FAIL: non-admin called reject_user without being blocked';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform * from public.admin_delete_user(v_b, 'spam');
    raise exception 'FAIL: non-admin called admin_delete_user without being blocked';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform * from public.approve_opportunity(v_opa, null);
    raise exception 'FAIL: non-admin called approve_opportunity without being blocked';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform * from public.reject_opportunity(v_opa, 'spam');
    raise exception 'FAIL: non-admin called reject_opportunity without being blocked';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- 20. A user cannot read another user's bookmarks (IDOR on a per-user table).
--     opportunity_bookmarks is select-own-only (user_id = auth.uid()).
set local role postgres;
do $$
declare
  v_a   uuid := (select v from _test_ctx where k='user_a');
  v_b   uuid := (select v from _test_ctx where k='user_b');
  v_opb uuid := (select v from _test_ctx where k='opp_b');
  v_seen int;
begin
  -- Seed a bookmark owned by B (role postgres bypasses RLS for the insert).
  insert into public.opportunity_bookmarks (user_id, opportunity_id)
  values (v_b, v_opb) on conflict do nothing;

  -- As A, B's bookmark must be invisible.
  perform _set_caller(v_a);
  select count(*) into v_seen from public.opportunity_bookmarks where user_id = v_b;
  if v_seen <> 0 then
    raise exception 'FAIL: user A could read user B''s bookmarks (% rows)', v_seen;
  end if;
end;
$$;

-- 21. Function-grant lockdown (regression guard for the whole class of bug).
--     On Supabase the real authz boundary for a function is its in-body check
--     PLUS the named-role grant — `revoke ... from public` alone is a no-op
--     because anon/authenticated hold direct grants. This assertion fails CI
--     if ANY public function outside the intentionally-callable allowlist
--     becomes EXECUTE-able by anon or authenticated (e.g. a future migration
--     that forgets to lock a new internal/cron/trigger function, or relies on
--     `revoke from public`). `has_function_privilege` is authoritative — it
--     accounts for direct grants, the PUBLIC grant, and role membership.
--
--     Every name in the allowlist is reached by the frontend as a user
--     session AND self-defends in-body (is_admin / auth.uid / is_approved),
--     or is an RLS helper (is_admin/is_approved) the policies call. Adding a
--     new user-facing RPC means adding it here on purpose — that deliberate
--     edit is the point of the tripwire.
set local role postgres;
do $$
declare
  v_allowed text[] := array[
    -- RLS + app helpers (policies call is_admin/is_approved)
    'is_admin','is_approved',
    -- account / profile (user)
    'delete_my_account','update_profile','submit_onboarding',
    -- listing submit / edit (user)
    'submit_opportunity','update_opportunity','submit_event','submit_vc_grant',
    -- admin direct-create
    'admin_create_opportunity','admin_create_event','admin_create_vc_grant',
    -- admin review queues + actions
    'list_pending_opportunities_admin','list_pending_events_admin',
    'approve_opportunity','reject_opportunity','approve_event','reject_event',
    'approve_vc_grant','reject_vc_grant','approve_user','reject_user',
    'admin_delete_user','admin_delete_graduates','admin_get_signup_emails',
    'admin_outbound_email_stats',
    -- public / member reads
    'list_approved_opportunities','list_approved_events',
    'list_my_bookmarked_opportunities',
    'get_my_activity','get_my_listing_actions','get_my_listing_stats',
    'get_opportunity_for_edit','get_event_for_edit',
    -- listing engagement
    'mark_listing_action','unmark_listing_action','record_listing_event'
  ];
  v_leaked text;
begin
  select string_agg(distinct p.proname, ', ' order by p.proname)
    into v_leaked
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.prokind = 'f'
     -- only our own functions; ignore anything owned by an extension
     and not exists (
       select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e')
     and (has_function_privilege('anon',          p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     and not (p.proname = any (v_allowed));
  if v_leaked is not null then
    raise exception
      'FAIL: internal function(s) EXECUTE-able by anon/authenticated: %', v_leaked;
  end if;
end;
$$;

-- ─── Cleanup ────────────────────────────────────────────────────────
-- The test blocks leak the transaction-local 'authenticated' role (see note
-- above), so reset to the owner role before dropping the helper function.
set local role postgres;
drop function _set_caller(uuid);
rollback;

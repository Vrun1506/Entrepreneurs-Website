-- ════════════════════════════════════════════════════════════════════
-- Foundry · Why 11 accounts have sat at 'pending_onboarding' since June
--
-- RUN THIS IN THE SUPABASE SQL EDITOR, AGAINST PRODUCTION.
-- Sections 1–4 are READ-ONLY. Section 5 deletes, and is commented out.
--
-- THE QUESTION THIS ANSWERS
--
-- 'pending_onboarding' is the status a profile is created with. It means
-- the account exists and the onboarding form was never completed. That is
-- one status covering three completely different situations, and the fix
-- is different for each:
--
--   (a) never confirmed their email  → they never reached the form at all.
--       Not an onboarding problem. Deliverability, a typo'd address, or a
--       test row someone abandoned.
--   (b) confirmed, signed in, no profile data → they saw the form and
--       walked away. Ordinary funnel drop-off unless the numbers are ugly.
--   (c) confirmed, signed in, course + grad_year present but linkedin_url
--       NULL, on a non-student role → they hit the wall. The live form
--       refuses to advance past step 3 for any non-student without a
--       LinkedIn URL:
--
--         OnboardingForm.tsx:77
--         if (role !== "student" && !lk)
--           return "A LinkedIn URL is required for accounts without an
--                   Imperial email address.";
--
--       Those are the ones worth acting on. Everything they typed is
--       still in the row; they were stopped one field from the end.
--
-- The recorded theory was that the LinkedIn wall explained all 11. It
-- cannot: 8 of the 11 are students, and students are exempt from that
-- branch. So at most 3 fit (c), and the other 8 need a different
-- explanation. Section 2 is what settles it.
--
-- One more thing worth knowing before reading the output: .env.local was
-- pointed at PRODUCTION once and seeded 3 users plus an admin into it.
-- Some fraction of these rows may be that incident rather than real
-- signups. Section 3 is built to make that visible.
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. The headline: which of the three situations, and how many ────
select
  case
    when u.email_confirmed_at is null                       then 'a · never confirmed email'
    when p.course is null and p.grad_year is null           then 'b · confirmed, form untouched'
    when p.role <> 'student' and p.linkedin_url is null     then 'c · blocked by the LinkedIn wall'
    else                                                         'd · partial, no obvious blocker'
  end                                as situation,
  count(*)                           as accounts,
  min(p.created_at)::date            as earliest,
  max(p.created_at)::date            as latest
from public.profiles p
join auth.users u on u.id = p.id
where p.status = 'pending_onboarding'
group by 1
order by 1;


-- ─── 2. Row by row, with how far each one actually got ───────────────
-- Read `reached` left to right: it is the order the live form asks in.
select
  u.email,
  p.role,
  p.created_at::date                                  as signed_up,
  u.email_confirmed_at is not null                    as confirmed,
  u.last_sign_in_at::date                             as last_seen,
  u.raw_app_meta_data->>'provider'                    as provider,
  concat_ws(' · ',
    case when p.first_name  is not null then 'name'      end,
    case when p.course      is not null then 'course'    end,
    case when p.grad_year   is not null then 'grad_year' end,
    case when p.bio         is not null then 'bio'       end,
    case when p.working_on  is not null then 'working_on'end,
    case when p.linkedin_url is not null then 'linkedin' end
  )                                                   as reached,
  -- The smoking gun for situation (c), on one line.
  (p.role <> 'student'
     and p.grad_year is not null
     and p.linkedin_url is null)                      as stopped_by_linkedin_rule
from public.profiles p
join auth.users u on u.id = p.id
where p.status = 'pending_onboarding'
order by p.created_at;


-- ─── 3. Test rows or real people? ────────────────────────────────────
-- Grouped by email domain and by whether the address looks generated.
-- A cluster of same-domain accounts created within minutes of each other
-- is the .env.local seeding incident, not a signup funnel.
select
  split_part(u.email, '@', 2)                      as domain,
  count(*)                                         as accounts,
  count(*) filter (
    where u.email ~* '(test|e2e|seed|demo|example|\+)'
  )                                                as look_generated,
  -- coalesce because auth.users.created_at can be NULL on rows a script
  -- inserted directly rather than through GoTrue — which is precisely the
  -- kind of row this section exists to find. profiles.created_at always has one.
  min(coalesce(u.created_at, p.created_at))        as first_created,
  max(coalesce(u.created_at, p.created_at))        as last_created,
  -- Seconds between the first and last of the group. Single digits means
  -- a script made them; days or weeks means people did.
  round(extract(epoch from max(coalesce(u.created_at, p.created_at))
                         - min(coalesce(u.created_at, p.created_at))))::bigint
                                                   as spread_seconds
from public.profiles p
join auth.users u on u.id = p.id
where p.status = 'pending_onboarding'
group by 1
order by accounts desc, domain;


-- ─── 4. Is this cohort unusual, or does everyone drop off here? ──────
-- Without a denominator the 11 mean nothing. If a similar share of every
-- month's signups is stuck, it is a funnel; if June is an outlier, it is
-- a bug that has since been fixed or introduced.
select
  date_trunc('month', p.created_at)::date                              as month,
  count(*)                                                             as signups,
  count(*) filter (where p.status = 'pending_onboarding')              as still_stuck,
  round(100.0 * count(*) filter (where p.status = 'pending_onboarding')
        / nullif(count(*), 0), 1)                                      as pct_stuck
from public.profiles p
group by 1
order by 1;


-- ════════════════════════════════════════════════════════════════════
-- 5. CLEANUP — COMMENTED OUT. READ SECTION 3 FIRST.
-- ════════════════════════════════════════════════════════════════════
--
-- Delete by an EXPLICIT list of addresses you have personally read in
-- section 2's output. Never by a WHERE clause over status: 'pending_
-- onboarding' is also the status of someone who signed up ten minutes
-- ago and is still typing, and a status-keyed delete would take them
-- with it.
--
-- admin_delete_user() is used rather than a raw delete because it owns
-- the cascade and writes the audit row. It needs an admin identity, and
-- the SQL editor has no JWT — so the service_role claim below is what
-- makes auth.role() return 'service_role' for this transaction. It is
-- transaction-local (set_config's third argument), so it cannot leak.
--
-- Uncomment, put the real addresses in, and run it as ONE statement.
--
-- do $$
-- declare
--   v_email text;
--   v_id    uuid;
--   v_kill  text[] := array[
--     'replace-me@example.com'   -- ← paste ONLY addresses you checked
--   ];
-- begin
--   perform set_config('request.jwt.claims',
--     json_build_object('role','service_role')::text, true);
--
--   foreach v_email in array v_kill loop
--     select id into v_id from auth.users where lower(email) = lower(v_email);
--     if v_id is null then
--       raise notice 'skip  % — no such user', v_email;
--       continue;
--     end if;
--     -- Refuse to touch anyone who finished onboarding, whatever the list says.
--     if (select status from public.profiles where id = v_id)
--          is distinct from 'pending_onboarding' then
--       raise notice 'SKIP  % — not pending_onboarding, left alone', v_email;
--       continue;
--     end if;
--     perform public.admin_delete_user(v_id, 'abandoned onboarding — cleanup 2026-08');
--     raise notice 'ok    deleted %', v_email;
--   end loop;
-- end;
-- $$;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Completing admin (and member) profile records after the
--          20260828 intake migrations
--
-- RUN THIS IN THE SUPABASE SQL EDITOR, AFTER migrations 1–5.
--
-- 20260828000003 added five columns to public.profiles:
--
--   preferred_name   text      what /home and the intake greet you by
--   bio_focus        text      "what you're working on" (backfilled)
--   bio_hobbies      text      the human half of the profile card
--   avatar_path      text      blob key for the profile photo
--   profile_version  smallint  1 = pre-intake record, 2 = complete
--
-- Only bio_focus was backfilled (from working_on, else bio). The rest are
-- NULL on every existing row, admins included. Nothing is broken by that
-- today — every new column is nullable and /home falls back to first_name
-- — but an admin browsing the member-facing UI for diagnostics sees a
-- record that looks half-filled, and the resume flow keyed on
-- profile_version < 2 will sweep them up once it lands.
--
-- ──────────────────────────────────────────────────────────────────────
-- ⚠ THE TRAP: THREE COLUMNS CANNOT BE WRITTEN FROM THE SQL EDITOR
-- ──────────────────────────────────────────────────────────────────────
--
-- profiles carries BEFORE UPDATE triggers on role, status and
-- avatar_path. They allow the write when auth.role() = 'service_role' or
-- is_admin() is true. In the SQL editor there is no JWT, so
-- request.jwt.claims is unset, auth.role() returns NULL and auth.uid()
-- returns NULL — meaning **you are neither**, however much of a superuser
-- the connection is. Verified, not assumed:
--
--   update profiles set preferred_name = 'Pat' … →  SUCCEEDED
--   update profiles set status         = 'approved' … →  REFUSED
--        ERROR: Only admins can change profile status
--   update profiles set avatar_path    = 'x/y.png' … →  REFUSED
--        ERROR: avatar_path is set by the upload service, not directly
--
-- So: preferred_name, bio_focus, bio_hobbies and profile_version write
-- normally. To touch role, status or avatar_path you must claim
-- service_role for the transaction, as §3 does. That is the same
-- mechanism the RPCs use, it is transaction-local, and it ends at COMMIT.
-- ════════════════════════════════════════════════════════════════════


-- ─── §1 · DIAGNOSTIC — read-only, run this first ─────────────────────
-- Every admin, and what their profile record is missing.
select
  u.email,
  p.first_name || ' ' || p.surname                      as name,
  p.role,
  p.status,
  p.profile_version,
  coalesce(p.preferred_name, '— missing')               as preferred_name,
  case when p.bio_focus   is null then '— missing' else left(p.bio_focus, 40)   end as bio_focus,
  case when p.bio_hobbies is null then '— missing' else left(p.bio_hobbies, 40) end as bio_hobbies,
  case when p.avatar_path is null then '— missing' else 'set' end as avatar,
  case when p.course      is null then '— missing' else p.course end as course,
  p.grad_year
from public.admins a
join public.profiles p on p.id = a.user_id
join auth.users      u on u.id = a.user_id
order by u.email;

-- Everyone else, bucketed. Confirms nothing regressed for members and
-- surfaces the accounts that never finished onboarding.
select
  status,
  role,
  count(*)                                                   as profiles,
  count(*) filter (where preferred_name is null)             as no_preferred_name,
  count(*) filter (where bio_focus      is null)             as no_bio_focus,
  count(*) filter (where avatar_path    is null)             as no_avatar,
  count(*) filter (where course         is null)             as no_course,
  count(*) filter (where grad_year      is null)             as no_grad_year,
  count(*) filter (where profile_version < 2)                as pre_intake
from public.profiles
group by status, role
order by status, role;

-- Rows that would violate the (NOT VALID) constraint from 20260828000002
-- if it were validated today. MUST return zero rows before §4.
select id, role, status, grad_year
from public.profiles
where not (
      status = 'pending_onboarding'
   or role in ('mentor', 'angel', 'staff_faculty')
   or grad_year is not null
);


-- ─── §2 · THE SAFE FIELDS — no claim needed ──────────────────────────
-- Edit the VALUES list: one row per admin, keyed by email so you cannot
-- update the wrong account by mistyping a UUID. Delete the rows you do
-- not want to touch. NULL leaves a field as it is.
--
-- profile_version is set to 2 only where the record is genuinely
-- complete — see the CASE at the bottom. Do not force it to 2 on a row
-- that still has gaps: the resume flow reads it as "this member has
-- already given us everything the new intake asks for", and a false 2
-- means they are never asked.

begin;

with input (email, preferred_name, bio_focus, bio_hobbies) as (
  values
    -- ('you@imperial.ac.uk', 'Pat', 'Running Foundry and the society''s ops.', 'Climbing, bad sci-fi.'),
    -- ('other@imperial.ac.uk', NULL,  NULL, NULL),
    (NULL, NULL, NULL, NULL)   -- placeholder so the statement parses with no rows filled in
)
update public.profiles p
   set preferred_name = coalesce(i.preferred_name, p.preferred_name),
       bio_focus      = coalesce(i.bio_focus,      p.bio_focus),
       bio_hobbies    = coalesce(i.bio_hobbies,    p.bio_hobbies)
  from input i
  join auth.users u on lower(u.email) = lower(i.email)
 where p.id = u.id
   and i.email is not null;

-- Promote to version 2 only where every field the new intake asks for is
-- now present. avatar_path is deliberately NOT in this list: it is set by
-- the upload service, and gating the version on it would leave every
-- admin at 1 until the Azure route exists.
update public.profiles p
   set profile_version = 2
  from public.admins a
 where a.user_id = p.id
   and p.profile_version < 2
   and p.preferred_name is not null
   and p.bio_focus      is not null
   and p.bio_hobbies    is not null
   and p.course         is not null
   and (p.grad_year is not null or p.role in ('mentor', 'angel', 'staff_faculty'));

-- Check the result before you keep it.
select u.email, p.preferred_name, p.bio_focus, p.bio_hobbies, p.profile_version
from public.admins a
join public.profiles p on p.id = a.user_id
join auth.users      u on u.id = a.user_id
order by u.email;

-- rollback;   -- ← run this instead if the SELECT above looks wrong
commit;


-- ─── §3 · THE GUARDED FIELDS — role, status, avatar_path ─────────────
-- Only needed if an admin's own record is stuck (e.g. still
-- pending_onboarding, so the app keeps bouncing them to /onboarding), or
-- to point avatar_path at a blob you uploaded out of band.
--
-- set_config(..., true) is transaction-local: the claim exists for these
-- statements and is gone at COMMIT. It does not persist, and no other
-- session sees it.

-- begin;
--
-- select set_config('request.jwt.claims', '{"role":"service_role"}', true);
--
-- update public.profiles p
--    set status = 'approved'
--   from auth.users u
--  where u.id = p.id
--    and lower(u.email) = lower('you@imperial.ac.uk')
--    and p.status <> 'approved';
--
-- -- avatar_path is a blob KEY, not a URL — the host is built at render
-- -- time so the bucket can move without a data migration.
-- update public.profiles p
--    set avatar_path = 'avatars/<random-key>.jpg'
--   from auth.users u
--  where u.id = p.id
--    and lower(u.email) = lower('you@imperial.ac.uk');
--
-- select p.status, p.avatar_path
--   from public.profiles p join auth.users u on u.id = p.id
--  where lower(u.email) = lower('you@imperial.ac.uk');
--
-- commit;


-- ─── §4 · VALIDATE THE CONSTRAINT ────────────────────────────────────
-- 20260828000002 added profiles_grad_year_role_consistency as NOT VALID,
-- so it guards new writes but was never checked against existing rows.
-- Run this ONLY once the third query in §1 returns zero rows. It takes an
-- ACCESS EXCLUSIVE lock on profiles for the duration of the scan — fine at
-- 28 rows, worth a quiet moment at 1,000+.

-- alter table public.profiles
--   validate constraint profiles_grad_year_role_consistency;

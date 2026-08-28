-- ════════════════════════════════════════════════════════════════════
-- Foundry · Did 20260828000001–05 actually land? (READ-ONLY)
--
-- verify_prod_schema.sql predates these five migrations, so a clean run
-- of it proves nothing DRIFTED — not that the new work ARRIVED. This is
-- the other half. No writes. Raises on the first thing missing.
-- ════════════════════════════════════════════════════════════════════

do $$
declare
  v_bad text;
  v_n   int;
begin
  -- 1 · Enum carries all six values (migration 01).
  select string_agg(want, ', ') into v_bad
  from (values ('student'),('alum'),('recent_grad'),('mentor'),('angel'),('staff_faculty')) as x(want)
  where not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and e.enumlabel = x.want
  );
  if v_bad is not null then
    raise exception '01 · user_role is MISSING value(s): %', v_bad;
  end if;
  raise notice 'OK  01  user_role has all six values';

  -- 2 · Role-aware grad-year constraint replaced the old one (migration 02).
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'profiles'
      and c.conname = 'profiles_grad_year_role_consistency'
  ) then
    raise exception '02 · constraint profiles_grad_year_role_consistency missing';
  end if;
  raise notice 'OK  02  profiles_grad_year_role_consistency present';

  -- 3 · Auto-approve is an allow-list, not a fall-through (migration 02).
  --     The single most important line in the whole batch: if a new role
  --     reaches 'approved' without an admin, that is an admission bypass.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'submit_onboarding')
     not like '%pending_review%' then
    raise exception '02 · submit_onboarding never sets pending_review — auto-approve is not gated';
  end if;
  raise notice 'OK  02  submit_onboarding still routes non-students to pending_review';

  -- 4 · The five intake columns (migration 03).
  select string_agg(want, ', ') into v_bad
  from (values ('preferred_name'),('bio_focus'),('bio_hobbies'),('avatar_path'),('profile_version')) as x(want)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = x.want
  );
  if v_bad is not null then
    raise exception '03 · profiles is MISSING column(s): %', v_bad;
  end if;
  raise notice 'OK  03  profiles has all five intake columns';

  -- 5 · avatar_path is not client-writable (migration 03).
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles'
      and t.tgname = 'profiles_protect_avatar_path' and not t.tgisinternal
  ) then
    raise exception '03 · trigger profiles_protect_avatar_path missing';
  end if;
  raise notice 'OK  03  profiles_protect_avatar_path present';

  -- 6 · set_my_affiliation exists, once, SECURITY DEFINER (migration 04).
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_my_affiliation';
  if v_n <> 1 then
    raise exception '04 · set_my_affiliation has % definitions, expected exactly 1', v_n;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_my_affiliation' and p.prosecdef
  ) then
    raise exception '04 · set_my_affiliation is not SECURITY DEFINER';
  end if;
  raise notice 'OK  04  set_my_affiliation present, single definition, SECURITY DEFINER';

  -- 7 · Its two guards are in the body. This RPC is deliberately granted to
  --     `authenticated`, which is only safe because it refuses to move a
  --     profile INTO or OUT OF 'student' — the role that auto-approves.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_my_affiliation')
     not like '%student%' then
    raise exception '04 · set_my_affiliation body does not mention student — guards are gone';
  end if;
  raise notice 'OK  04  set_my_affiliation still guards the student role';

  -- 8 · Migration 05 is the live submit_onboarding, not migration 02's.
  --     The GUC reset is what distinguishes them; without it the
  --     onboarding flag stays raised for the rest of the transaction.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'submit_onboarding')
     not like '%''foundry.onboarding_submission'', ''false''%' then
    raise exception '05 · submit_onboarding is the pre-05 version — GUC reset is missing';
  end if;
  raise notice 'OK  05  submit_onboarding carries the GUC reset';

  raise notice '─── 01–05 ALL PRESENT ───';
end $$;

-- ──────────────────────────────────────────────────────────────────────
-- Snapshot to eyeball.
-- ──────────────────────────────────────────────────────────────────────

select e.enumsortorder as ord, e.enumlabel as user_role_value
from pg_enum e join pg_type t on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public' and t.typname = 'user_role'
order by e.enumsortorder;

-- Who can EXECUTE set_my_affiliation. `authenticated` here is expected and
-- deliberate; `anon` here would be a hole.
select r.rolname as grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public' and p.proname = 'set_my_affiliation'
  and a.privilege_type = 'EXECUTE'
order by r.rolname;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('preferred_name','bio_focus','bio_hobbies','avatar_path','profile_version')
order by column_name;

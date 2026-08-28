-- ════════════════════════════════════════════════════════════════════
-- Foundry · Members can correct their own affiliation — except students
--
-- With two roles the choice at signup was unambiguous. With six it is
-- not: recent_grad vs alum, mentor vs staff_faculty, and alum vs angel
-- are all judgement calls a new member can reasonably get wrong. Today a
-- wrong pick is permanent without an admin running SQL.
--
-- WHY STUDENTS ARE EXCLUDED, BOTH WAYS
--
-- 'student' is the only role that auto-approves, so it is the only role
-- worth lying about. Refusing every transition that starts OR ends at
-- 'student' removes the incentive entirely — there is no sequence of
-- self-service calls that reaches an approved student account, and the
-- Imperial-domain re-check in submit_onboarding never even comes into
-- play as a second line of defence.
--
-- Excluding students costs nothing, because a student who graduates does
-- not change role: admin_delete_graduates deletes the account and emails
-- them to sign up again as an alum. The student→alum path is already a
-- delete-and-resignup, not a role change.
--
-- The five remaining roles differ only in admission rules (all of them
-- manual review), graduation-year handling, and how the directory labels
-- them. None of them grants access another one lacks, so moving between
-- them is not a privilege change and does not re-open review.
--
-- WHY A NEW FUNCTION RATHER THAN AN ARGUMENT ON submit_onboarding
--
-- Adding a parameter changes that function's signature, so CREATE OR
-- REPLACE would leave the 9-argument version in place and add a second
-- overload beside it. A separate single-purpose function avoids that
-- entirely, and it works from the profile page as well as from intake —
-- the ask was "at any time", not "during signup".
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Let the trigger recognise a vetted affiliation change ────────
-- Same mechanism tg_profiles_protect_status already uses for
-- submit_onboarding: a transaction-local GUC set immediately before the
-- UPDATE by a SECURITY DEFINER function whose own checks are the policy.
--
-- This is necessary, not cosmetic: auth.role() reads the CALLER's JWT
-- claim even inside a SECURITY DEFINER function, so without this branch
-- the trigger rejects the update with 'Only admins can change a member's
-- role'. Verified against the live trigger before writing this.
create or replace function public.tg_profiles_protect_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    -- set_my_affiliation() sets this immediately before its UPDATE. It is
    -- transaction-local (set_config 3rd arg true), so it cannot leak to
    -- another statement or session, and the function's own guards — never
    -- from 'student', never to 'student' — are the actual rule.
    if current_setting('foundry.affiliation_change', true) = 'true' then
      return new;
    end if;
    raise exception 'Only admins can change a member''s role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_profiles_protect_role()
  from public, anon, authenticated;

-- ─── 2. set_my_affiliation ───────────────────────────────────────────
create or replace function public.set_my_affiliation(p_role user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller    uuid := auth.uid();
  v_role      user_role;
  v_grad_year int;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select role, grad_year into v_role, v_grad_year
    from public.profiles where id = v_caller;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if p_role = v_role then
    return; -- no-op, not an error
  end if;

  -- The whole security argument, in two lines.
  if v_role = 'student' then
    raise exception 'Students cannot change their affiliation here. When you graduate your account is closed and you sign up again as an alum.'
      using errcode = '42501';
  end if;
  if p_role = 'student' then
    raise exception 'Student accounts are only created at signup, with a verified Imperial email address.'
      using errcode = '42501';
  end if;

  -- profiles_grad_year_role_consistency requires a graduation year for the
  -- two graduated roles. Moving to one without a year on file would fail
  -- the constraint with a message nobody can act on, so say it plainly.
  if p_role in ('recent_grad', 'alum') and v_grad_year is null then
    raise exception 'Add your graduation year to your profile before switching to this affiliation'
      using errcode = '22023';
  end if;

  -- Opened immediately before the UPDATE and closed immediately after.
  -- set_config's third argument makes this transaction-local, NOT
  -- statement-local: without the reset below, the flag stays raised for the
  -- rest of the transaction and a later direct UPDATE would ride through the
  -- trigger on it. Caught by the GUC-leak assertion in
  -- supabase/tests/admission_roles.sql, which exists for exactly this.
  perform set_config('foundry.affiliation_change', 'true', true);

  -- grad_year is deliberately LEFT ALONE. An earlier draft nulled it when
  -- moving to mentor/angel/staff_faculty, on the grounds that those roles
  -- have no graduation year. That loses data on a round trip: an alum who
  -- switches to angel and back would be told to re-enter a year we had
  -- just deleted. The CHECK constraint exempts those three from *needing*
  -- one; it does not forbid holding one, and an angel who is also an
  -- Imperial alum having a graduation year on file is accurate, not stale.
  update public.profiles
     set role = p_role
   where id = v_caller;

  perform set_config('foundry.affiliation_change', 'false', true);
end;
$$;

revoke execute on function public.set_my_affiliation(user_role) from public, anon;
grant execute on function public.set_my_affiliation(user_role) to authenticated;

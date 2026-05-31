-- Relax profiles_grad_year_role_consistency to permit null grad_year
-- while the profile is still in pending_onboarding.
--
-- Why: OAuth providers (Google for alumni, future Microsoft for students)
-- don't return a graduation year at sign-up time. The trigger has to
-- insert the row with grad_year = null and let onboarding collect it.
--
-- The constraint still fires on every INSERT/UPDATE, so the moment we
-- move status to pending_review (or anything else), the role/grad_year
-- consistency check is enforced — onboarding cannot complete without
-- a valid grad_year for alumni or a null for students.

alter table public.profiles
  drop constraint if exists profiles_grad_year_role_consistency;

alter table public.profiles
  add constraint profiles_grad_year_role_consistency check (
    status = 'pending_onboarding'
    or (role = 'alum'    and grad_year is not null)
    or (role = 'student' and grad_year is null)
  );

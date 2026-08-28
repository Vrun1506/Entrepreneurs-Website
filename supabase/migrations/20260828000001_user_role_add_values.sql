-- ════════════════════════════════════════════════════════════════════
-- Foundry · user_role → six values
--
-- PRODUCT.md names six audiences; the enum has carried two since the
-- initial schema. This migration adds the missing four and does NOTHING
-- ELSE, on purpose.
--
-- Postgres will not let a value added by ALTER TYPE ... ADD VALUE be
-- *used* in the same transaction that adds it. Everything that reads or
-- writes the new values — the CHECK constraint, submit_onboarding,
-- update_profile — therefore lives in 20260828000002, which must be run
-- as a separate statement batch. Running the two together will fail with
-- "unsafe use of new value ... of enum type user_role".
--
-- Existing rows are untouched. 'student' and 'alum' keep their meaning:
--   student       → currently studying          (auto-approve, Imperial only)
--   alum          → alumni founder              (manual review)
-- and the four new values are all manual review:
--   recent_grad   → within ~3 years of graduating
--   mentor        → operator/expert giving time
--   angel         → angel investor
--   staff_faculty → staff, faculty or researcher
--
-- Enum values cannot be removed once added. If a name here is wrong, it is
-- cheaper to fix it now than after rows reference it.
-- ════════════════════════════════════════════════════════════════════

alter type public.user_role add value if not exists 'recent_grad';
alter type public.user_role add value if not exists 'mentor';
alter type public.user_role add value if not exists 'angel';
alter type public.user_role add value if not exists 'staff_faculty';

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Opportunities expansion
--
-- Adds: application_deadline, contact_email, contact_email_visible,
--       apply_method (enum), apply_url.
-- Backfills existing rows so NOT NULL can be applied safely.
-- Updates the approval-metadata CHECK to permit the new 'expired' status.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. apply_method enum ────────────────────────────────────────────
create type public.apply_method as enum ('email', 'link');

-- ─── 2. New columns (nullable so backfill can run) ───────────────────
alter table public.opportunities
  add column if not exists application_deadline  date,
  add column if not exists contact_email         text,
  add column if not exists contact_email_visible boolean not null default false,
  add column if not exists apply_method          public.apply_method,
  add column if not exists apply_url             text;

-- ─── 3. Backfill ─────────────────────────────────────────────────────
-- Existing rows (if any) get sensible defaults:
--   - deadline: 30 days from today
--   - contact_email: the poster's signup email
--   - apply_method: 'email' (no apply_url)
update public.opportunities
   set application_deadline = current_date + 30
 where application_deadline is null;

update public.opportunities o
   set contact_email = au.email
  from auth.users au
 where au.id = o.posted_by
   and o.contact_email is null;

-- Anything still null after the join (shouldn't happen because posted_by
-- references profiles which references auth.users) gets a placeholder so
-- NOT NULL can be applied. The CHECK below validates format on new rows.
update public.opportunities
   set contact_email = 'unknown@example.com'
 where contact_email is null;

update public.opportunities
   set apply_method = 'email'
 where apply_method is null;

-- ─── 4. Enforce NOT NULL ─────────────────────────────────────────────
alter table public.opportunities
  alter column application_deadline set not null,
  alter column contact_email        set not null,
  alter column apply_method         set not null;

-- ─── 5. Constraints ──────────────────────────────────────────────────
alter table public.opportunities
  add constraint opportunities_contact_email_format check (
    contact_email ~* '^[^@]+@[^@]+\.[^@]+$'
  );

-- apply_method = 'email' → apply_url MUST be null (we use contact_email instead)
-- apply_method = 'link'  → apply_url MUST be a http(s) URL
alter table public.opportunities
  add constraint opportunities_apply_consistency check (
    (apply_method = 'email' and apply_url is null)
    or (apply_method = 'link' and apply_url is not null and apply_url ~* '^https?://')
  );

-- ─── 6. Update approval_metadata CHECK to allow 'expired' ────────────
-- An expired listing was previously approved, so approved_at / approved_by
-- are already set; we just need to permit the status value in the IN-list.
alter table public.opportunities
  drop constraint opportunities_approval_metadata;

alter table public.opportunities
  add constraint opportunities_approval_metadata check (
    (status in ('approved', 'rejected', 'expired') and approved_at is not null and approved_by is not null)
    or (status = 'pending' and approved_at is null and approved_by is null)
  );

-- ─── 7. Index for the daily expiry scan ──────────────────────────────
create index if not exists opportunities_status_deadline_idx
  on public.opportunities (status, application_deadline)
  where status = 'approved';

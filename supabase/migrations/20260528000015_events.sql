-- ════════════════════════════════════════════════════════════════════
-- Foundry · Events table
--
-- Mirrors the opportunities/vcs_grants pattern: posted by an approved
-- member, requires admin approval before showing in /events.
-- ════════════════════════════════════════════════════════════════════

create table public.events (
  id                    uuid           primary key default gen_random_uuid(),
  posted_by             uuid           not null references public.profiles(id) on delete restrict,
  status                listing_status not null default 'pending',
  title                 text           not null,
  description           text           not null,
  luma_link             text           not null,
  event_at              timestamptz    not null,
  location              text           not null,
  organiser_name        text           not null,
  contact_email         text           not null,
  contact_email_visible boolean        not null default false,
  rejected_reason       text,
  approved_at           timestamptz,
  approved_by           uuid           references auth.users(id) on delete set null,
  created_at            timestamptz    not null default now(),
  updated_at            timestamptz    not null default now(),

  constraint events_title_len          check (length(title)          between 2 and 200),
  constraint events_description_len    check (length(description)    between 20 and 5000),
  constraint events_location_len       check (length(location)       between 1 and 200),
  constraint events_organiser_name_len check (length(organiser_name) between 1 and 200),
  constraint events_luma_link_format   check (luma_link ~* '^https?://'),
  constraint events_contact_email_format check (
    contact_email ~* '^[^@]+@[^@]+\.[^@]+$'
  ),
  constraint events_rejected_reason_consistency check (
    (status = 'rejected' and rejected_reason is not null) or
    (status != 'rejected' and rejected_reason is null)
  ),
  constraint events_approval_metadata check (
    (status in ('approved', 'rejected', 'expired') and approved_at is not null and approved_by is not null) or
    (status = 'pending' and approved_at is null and approved_by is null)
  )
);

create index events_status_idx     on public.events (status);
create index events_posted_by_idx  on public.events (posted_by);
create index events_event_at_idx   on public.events (event_at);
create index events_created_at_idx on public.events (created_at desc);

-- ─── Triggers (reuse the helpers from initial_schema.sql) ────────────
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.tg_set_updated_at();

create trigger events_protect_status
  before update on public.events
  for each row execute function public.tg_listings_protect_status();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.events enable row level security;

create policy events_select_approved on public.events
  for select to authenticated
  using (status = 'approved' and public.is_approved());

create policy events_select_own on public.events
  for select to authenticated
  using (posted_by = auth.uid());

create policy events_select_admin on public.events
  for select to authenticated
  using (public.is_admin());

create policy events_insert_own on public.events
  for insert to authenticated
  with check (
    posted_by = auth.uid()
    and public.is_approved()
    and status = 'pending'
    and approved_at is null
    and approved_by is null
    and rejected_reason is null
  );

create policy events_update_own on public.events
  for update to authenticated
  using (posted_by = auth.uid() and status = 'pending')
  with check (posted_by = auth.uid() and status = 'pending');

create policy events_update_admin on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy events_delete_own on public.events
  for delete to authenticated
  using (posted_by = auth.uid() and status = 'pending');

create policy events_delete_admin on public.events
  for delete to authenticated
  using (public.is_admin());

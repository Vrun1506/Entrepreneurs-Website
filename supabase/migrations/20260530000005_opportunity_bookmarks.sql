-- ════════════════════════════════════════════════════════════════════
-- Foundry · Opportunity bookmarks
--
-- Lets approved members save opportunities they're interested in for
-- later. Composite PK on (user_id, opportunity_id) — a user can
-- bookmark each opportunity at most once. Cascade on opportunity
-- delete so a removed listing also removes everyone's stale
-- bookmarks. Cascade on auth.users delete too so the account-deletion
-- flow doesn't leave orphan rows.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.opportunity_bookmarks (
  user_id        uuid        not null references auth.users(id)         on delete cascade,
  opportunity_id uuid        not null references public.opportunities(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create index if not exists opportunity_bookmarks_user_idx
  on public.opportunity_bookmarks (user_id, created_at desc);

alter table public.opportunity_bookmarks enable row level security;

-- Read your own bookmarks.
drop policy if exists opportunity_bookmarks_select_own on public.opportunity_bookmarks;
create policy opportunity_bookmarks_select_own
  on public.opportunity_bookmarks for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Insert your own; cannot bookmark on behalf of someone else.
drop policy if exists opportunity_bookmarks_insert_own on public.opportunity_bookmarks;
create policy opportunity_bookmarks_insert_own
  on public.opportunity_bookmarks for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Remove your own.
drop policy if exists opportunity_bookmarks_delete_own on public.opportunity_bookmarks;
create policy opportunity_bookmarks_delete_own
  on public.opportunity_bookmarks for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ─── list_my_bookmarked_opportunities ───────────────────────────────
-- Mirrors list_approved_opportunities (migration 20260530000003-ish:
-- 20260530000002) but restricted to opportunities the caller has
-- bookmarked. SECURITY DEFINER for the same reason as the directory
-- RPC: contact_email column-level grant is revoked from authenticated.
create or replace function public.list_my_bookmarked_opportunities()
returns table (
  id                     uuid,
  position_name          text,
  company                text,
  pay                    text,
  location_type          public.location_type,
  location_text          text,
  description            text,
  start_month            smallint,
  start_year             int,
  application_deadline   date,
  contact_email          text,
  contact_email_visible  boolean,
  apply_method           public.apply_method,
  apply_url              text,
  posted_by              uuid,
  created_at             timestamptz,
  poster_first_name      text,
  poster_surname         text,
  poster_linkedin_url    text,
  skill_names            text[],
  sector_names           text[],
  bookmarked_at          timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    o.id, o.position_name, o.company, o.pay,
    o.location_type, o.location_text,
    o.description, o.start_month, o.start_year,
    o.application_deadline,
    case
      when o.contact_email_visible
        or o.posted_by = (select auth.uid())
        or public.is_admin()
      then o.contact_email
      else null
    end,
    o.contact_email_visible,
    o.apply_method, o.apply_url,
    o.posted_by, o.created_at,
    p.first_name, p.surname, p.linkedin_url,
    coalesce((
      select array_agg(s.name order by s.name)
      from public.opportunity_skills os
      join public.skills s on s.id = os.skill_id
      where os.opportunity_id = o.id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(s.name order by s.name)
      from public.opportunity_sectors os
      join public.sectors s on s.id = os.sector_id
      where os.opportunity_id = o.id
    ), ARRAY[]::text[]),
    b.created_at
  from public.opportunity_bookmarks b
  join public.opportunities o on o.id = b.opportunity_id
  left join public.profiles p on p.id = o.posted_by
  where b.user_id = (select auth.uid())
    and o.status = 'approved'
    and o.application_deadline >= current_date
  order by b.created_at desc;
$$;

grant execute on function public.list_my_bookmarked_opportunities() to authenticated;

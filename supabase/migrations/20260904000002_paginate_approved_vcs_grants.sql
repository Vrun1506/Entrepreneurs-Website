-- ════════════════════════════════════════════════════════════════════
-- Foundry · Filter and paginate the approved VC/grants list in Postgres
--
-- Sibling of 20260826000003 (the member directory's version of this same
-- fix). /vcs and /home's "recent VCs" strip both loaded the entire
-- approved list with `.limit(1000)` and filtered/searched it in the
-- browser. Fine at today's curated, admin-approved scale — the audit that
-- flagged this called it "verified solid, no action needed" — but it is
-- the same silent-truncation shape as the directory bug this migration's
-- sibling fixed, just not yet triggered. Closing it now rather than
-- waiting for it to become a repro.
--
-- As a side effect this also drops the "double-cast" RawRow workaround
-- documented in lib/data/vcs.ts: that existed because a hand-written
-- multi-line .select() with an embedded posted_by relation defeats
-- supabase-js's type-level parser. An RPC with a flat return table (the
-- same fix list_approved_events/list_approved_opportunities already use)
-- has no such column.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.list_approved_vcs_grants(
  p_query  text default null,
  p_kind   text default null,   -- 'vc' | 'grant' | null (all)
  p_from   date default null,   -- deadline range, inclusive
  p_to     date default null,
  p_limit  int  default 24,
  p_offset int  default 0
)
returns table (
  id                 uuid,
  kind               public.vc_grant_kind,
  name               text,
  description        text,
  link               text,
  amount             text,
  deadline           date,
  stage              text,
  posted_by          uuid,
  created_at         timestamptz,
  poster_first_name  text,
  poster_surname     text,
  -- Total matching rows, repeated on every row via a window function —
  -- same convention as list_directory_cards.total_count.
  total_count        bigint
)
language sql
stable
security definer
set search_path = public, auth
as $$
  with matched as (
    select g.*
      from public.vcs_grants g
     where g.status = 'approved'
       -- Same gate the RLS policy applies. SECURITY DEFINER bypasses RLS,
       -- so this is the check, not a duplicate of one.
       and (public.is_approved() or public.is_admin())
       and (p_kind is null or g.kind::text = p_kind)
       and (p_from is null or (g.deadline is not null and g.deadline >= p_from))
       and (p_to   is null or (g.deadline is not null and g.deadline <= p_to))
       and (
         p_query is null or p_query = '' or
         g.name        ilike '%' || p_query || '%' or
         g.description ilike '%' || p_query || '%' or
         g.amount      ilike '%' || p_query || '%' or
         g.stage       ilike '%' || p_query || '%'
       )
  ),
  counted as (
    select m.*, count(*) over () as total_count from matched m
  ),
  page as (
    select * from counted
     order by created_at desc, id
     limit greatest(1, least(coalesce(p_limit, 24), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    pg.id, pg.kind, pg.name, pg.description, pg.link,
    pg.amount, pg.deadline, pg.stage, pg.posted_by, pg.created_at,
    p.first_name, p.surname,
    pg.total_count
  from page pg
  join public.profiles p on p.id = pg.posted_by;
$$;

grant execute on function public.list_approved_vcs_grants(
  text, text, date, date, int, int
) to authenticated;

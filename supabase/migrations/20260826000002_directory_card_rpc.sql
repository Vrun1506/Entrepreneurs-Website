-- ════════════════════════════════════════════════════════════════════
-- Foundry · A directory list that doesn't ship the whole profile
--
-- /community selected every column of every approved profile and handed
-- the lot to the client. Measured at 1,203 members with fields near their
-- column caps, that is a 2,261 kB payload — serialised into the RSC
-- stream on *every* navigation, because force-dynamic (needed for the
-- nonce CSP) means none of it is cached by Next.
--
-- Most of it is never displayed on the card. bio is rendered
-- line-clamp-2, working_on line-clamp-1, and the three profile URLs
-- appear only in the dialog. Truncating to what the card actually shows,
-- and dropping the URLs, takes the same 1,203 rows to 681 kB.
--
-- Truncation has to happen in SQL rather than in the mapper: doing it in
-- TypeScript would shrink what reaches the browser but still pull every
-- byte out of Postgres first, leaving the database egress — the part that
-- costs money at 1,000 members — untouched.
--
-- The dialog reads the full bio, working_on and URLs on open, via a
-- plain RLS-gated select. No RPC needed for that: the profiles policies
-- already restrict reads to approved members.
-- ════════════════════════════════════════════════════════════════════

-- Preview lengths. Generous next to what the card renders (two clamped
-- lines and one) so a slightly wider viewport can't run out of text.
create or replace function public.list_directory_cards()
returns table (
  id           uuid,
  first_name   text,
  surname      text,
  role         public.user_role,
  course       text,
  grad_year    smallint,
  bio          text,
  working_on   text,
  created_at   timestamptz,
  skill_names  text[],
  sector_names text[]
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id, p.first_name, p.surname, p.role, p.course, p.grad_year,
    left(p.bio, 160),
    left(p.working_on, 100),
    p.created_at,
    coalesce((
      select array_agg(s.name order by s.name)
      from public.profile_skills ps
      join public.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
    ), ARRAY[]::text[]),
    coalesce((
      select array_agg(sc.name order by sc.name)
      from public.profile_sectors psc
      join public.sectors sc on sc.id = psc.sector_id
      where psc.profile_id = p.id
    ), ARRAY[]::text[])
  from public.profiles p
  where p.status = 'approved'
    -- Same gate the RLS policy applies. SECURITY DEFINER bypasses RLS, so
    -- this is the check, not a duplicate of one.
    and (public.is_approved() or public.is_admin())
  order by p.created_at desc;
$$;

grant execute on function public.list_directory_cards() to authenticated;

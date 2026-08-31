-- ════════════════════════════════════════════════════════════════════
-- Foundry · Plain likes on community posts
--
-- A count only. It never affects feed order, ranking, or visibility —
-- list_community_feed stays plain reverse-chronological, unchanged below
-- except for the two extra columns. See production-runbook.md and this
-- migration's own PR for why that boundary matters here specifically:
-- the feature's Online Safety Act risk assessment
-- (docs/compliance/09-osa-illegal-content-risk-assessment.md) is written
-- around "no algorithmic amplification" as a load-bearing fact, not an
-- aspiration, so this table and RPC exist to add a count and nothing
-- else touches ordering.
--
-- WRITE PATH. Deny-all RLS, one security-definer RPC — matching every
-- other community-posts write (create_post, report_post, delete_my_post),
-- not opportunity_bookmarks' older RLS-scoped insert/delete pattern.
-- 20260830000001_community_posts_hardening.sql closed exactly that hole
-- for this feature: any table `authenticated` can write to directly is
-- reachable via PostgREST with no Upstash rate limit in front of it.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. post_likes ────────────────────────────────────────────────────
create table if not exists public.post_likes (
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;
-- No policies → deny-all, same as upload_tickets. Reached only through
-- toggle_post_like below and the count subqueries in list_community_feed
-- / list_my_posts — never directly.


-- ─── 2. toggle_post_like ──────────────────────────────────────────────
create or replace function public.toggle_post_like(p_post_id uuid)
returns table (liked boolean, like_count int)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_author uuid;
  v_liked  boolean;
begin
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  select author_id into v_author from public.posts
   where id = p_post_id and expires_at > now();
  if v_author is null then
    raise exception 'Post not found';
  end if;
  if v_author = v_caller then
    raise exception 'Cannot like your own post';
  end if;

  -- DB-side floor, same reasoning as create_post's inline count check
  -- (20260830000001): this RPC is directly callable via PostgREST,
  -- bypassing the app's Upstash rate limit entirely. Generous — not
  -- trying to be the real control, just closing the hole a scripted
  -- loop would otherwise find.
  if (select count(*) from public.post_likes
       where user_id = v_caller and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many like actions — try again shortly.' using errcode = '42501';
  end if;

  if exists (select 1 from public.post_likes where post_id = p_post_id and user_id = v_caller) then
    delete from public.post_likes where post_id = p_post_id and user_id = v_caller;
    v_liked := false;
  else
    insert into public.post_likes (post_id, user_id) values (p_post_id, v_caller);
    v_liked := true;
  end if;

  return query select v_liked, (select count(*)::int from public.post_likes where post_id = p_post_id);
end;
$$;

-- `from public` alone is not enough on this project — Supabase's default
-- privileges hand anon its own direct grant regardless (20260601000000,
-- 20260827000001), the same reason list_community_feed/list_my_posts below
-- name anon explicitly.
revoke execute on function public.toggle_post_like(uuid) from public, anon;
grant  execute on function public.toggle_post_like(uuid) to authenticated;


-- ─── 3. list_community_feed — add like_count / liked_by_me ────────────
-- Unchanged otherwise: same filter, same order, same pagination. Likes
-- are additive columns, not a new sort key.
--
-- The drop is required, not decorative: `returns table(...)` columns are
-- OUT parameters, and Postgres refuses `create or replace` the moment the
-- OUT-parameter list changes shape (SQLSTATE 42P13, confirmed the hard
-- way against a local reset) — same reason reject_user_full_delete.sql
-- (20260531000001) already needed this same drop.
drop function if exists public.list_community_feed(timestamptz, uuid, int);

create or replace function public.list_community_feed(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             int         default 20
)
returns table (
  id                uuid,
  kind              text,
  title             text,
  body              text,
  created_at        timestamptz,
  expires_at        timestamptz,
  author_id         uuid,
  author_first_name text,
  author_surname    text,
  author_role       user_role,
  source_table      text,
  source_id         uuid,
  images            jsonb,
  like_count        int,
  liked_by_me       boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.kind, p.title, p.body, p.created_at, p.expires_at,
    p.author_id, pr.first_name, pr.surname, pr.role,
    p.source_table, p.source_id,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'blob_key', pi.blob_key, 'alt_text', pi.alt_text,
                'width', pi.width, 'height', pi.height)
              order by pi.position)
         from public.post_images pi where pi.post_id = p.id),
      '[]'::jsonb
    ),
    (select count(*)::int from public.post_likes pl where pl.post_id = p.id),
    exists (select 1 from public.post_likes pl where pl.post_id = p.id and pl.user_id = auth.uid())
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.expires_at > now()
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

-- MUST repeat the revoke/grant after every create or replace on this
-- function: create or replace silently re-runs Supabase's default
-- privilege grants, which has handed anon a fresh EXECUTE grant on a
-- previously-locked-down function twice before in this codebase's
-- history (20260601000000, 20260827000001) — see
-- community_system_posts.sql's header comment for the fuller version of
-- this warning.
revoke execute on function public.list_community_feed(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_community_feed(timestamptz, uuid, int) to authenticated;


-- ─── 4. list_my_posts — add like_count ─────────────────────────────────
-- No liked_by_me here: every row is the caller's own post, and
-- toggle_post_like's self-like guard means it is always false.
-- Same drop-before-replace requirement as list_community_feed above.
drop function if exists public.list_my_posts(timestamptz, uuid, int);

create or replace function public.list_my_posts(
  p_cursor_created_at timestamptz default null,
  p_cursor_id         uuid        default null,
  p_limit             int         default 20
)
returns table (
  id         uuid,
  title      text,
  body       text,
  created_at timestamptz,
  expires_at timestamptz,
  images     jsonb,
  like_count int
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.title, p.body, p.created_at, p.expires_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'blob_key', pi.blob_key, 'alt_text', pi.alt_text,
                'width', pi.width, 'height', pi.height)
              order by pi.position)
         from public.post_images pi where pi.post_id = p.id),
      '[]'::jsonb
    ),
    (select count(*)::int from public.post_likes pl where pl.post_id = p.id)
  from public.posts p
  where p.author_id = v_caller
    and p.kind = 'member'
    and p.expires_at > now()
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

-- Same reason as list_community_feed above.
revoke execute on function public.list_my_posts(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_my_posts(timestamptz, uuid, int) to authenticated;

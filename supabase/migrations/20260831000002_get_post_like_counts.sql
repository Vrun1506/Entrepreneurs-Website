-- ════════════════════════════════════════════════════════════════════
-- Foundry · Batched like-count refresh, for feed polling
--
-- A second member liking a post has no way to reach anyone else's already-
-- open tab — there is no push channel here, and Realtime's Postgres
-- Changes would need private-channel authorization policies on top of
-- post_likes' existing deny-all RLS (20260831000001) to be safe to expose,
-- which is more infrastructure than a cosmetic count justifies. Instead
-- the client polls this RPC on an interval while the tab is visible
-- (CommunityClient.tsx) and merges the result into already-rendered posts.
--
-- Batched by design — one call for every post currently on screen, not one
-- call per card, so an open feed costs one RPC per poll regardless of how
-- many posts are showing.
--
-- No dedicated rate bucket, same as toggle_post_like: the "mutations"
-- backstop in frontend/src/lib/supabase/proxy.ts (60/min per user) already
-- covers every server action including this one, and 45s polling is
-- nowhere near it. The array-length cap below is the floor against a
-- direct PostgREST call, which bypasses that Next.js-level check entirely.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.get_post_like_counts(p_post_ids uuid[])
returns table (id uuid, like_count int, liked_by_me boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Forbidden: approved members only' using errcode = '42501';
  end if;

  -- Bounds worst-case work per call regardless of how it's invoked; the
  -- feed's own page size (list_community_feed) tops out at 50, so a
  -- legitimate poll never approaches this.
  if coalesce(array_length(p_post_ids, 1), 0) > 50 then
    raise exception 'Too many post ids in one request' using errcode = '22023';
  end if;

  return query
  select
    p.id,
    (select count(*)::int from public.post_likes pl where pl.post_id = p.id),
    exists (select 1 from public.post_likes pl where pl.post_id = p.id and pl.user_id = auth.uid())
  from public.posts p
  where p.id = any(p_post_ids)
    and p.expires_at > now();
end;
$$;

-- `from public` alone is not enough on this project — see
-- toggle_post_like's own comment (20260831000001) for the fuller version
-- of why anon has to be named explicitly.
revoke execute on function public.get_post_like_counts(uuid[]) from public, anon;
grant  execute on function public.get_post_like_counts(uuid[]) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — post-build hardening
--
-- Five findings from auditing 20260829000001-4 against the running code.
-- Two of them are real holes; three are correctness.
--
--   1. An admin could delete a post through PostgREST, skipping the
--      moderation log entirely. HIGH.
--   2. Every abuse limit lived in the Next.js action, and the RPCs are
--      EXECUTE-able by `authenticated`, so a member with their own JWT
--      could bypass all of them. HIGH.
--   3. Feed reads showed posts past expires_at until the hourly purge
--      caught up.
--   4. The admin report queue paged without a tiebreaker.
--   5. (In the app, not here.) Upload tickets drew from the posting
--      allowance — see lib/ratelimit.ts.
-- ════════════════════════════════════════════════════════════════════


-- ─── 1. Admins delete through the RPC, or not at all ────────────────
-- 20260829000001 shipped a `posts_delete_admin` RLS policy described as
-- "the backstop that RPC relies on". That was wrong twice over.
--
-- It is not needed: admin_delete_post is SECURITY DEFINER owned by the
-- role that owns `posts`, and a table owner bypasses RLS, so the policy
-- was never consulted on the RPC path.
--
-- And it is harmful: it made `DELETE /rest/v1/posts?id=eq.…` succeed for
-- any admin JWT. That path writes no post_moderation_log row, no
-- admin_actions row, resolves no reports and sends the author no notice —
-- it is a silent takedown. The whole reason this feature keeps a 12-month
-- moderation record is to be able to say what was removed, by whom and
-- why, including when the person asking is a regulator and the admin
-- account was compromised. A second, unlogged route defeats that.
--
-- Members keep posts_delete_own: it is exactly equivalent to
-- delete_my_post (same owner check, same kind check) and a member
-- deleting their own words is not an event anything needs to record.
drop policy if exists posts_delete_admin on public.posts;


-- ─── 2. Abuse limits that survive a direct RPC call ─────────────────
-- The Upstash limiter in lib/ratelimit.ts is the product control: it
-- gives the friendly message and it is what a member actually meets.
-- But `create_post`, `report_post` and `issue_upload_ticket` are all
-- granted to `authenticated`, so anyone who can open devtools can post
-- straight to PostgREST and never touch it.
--
-- On the listing tables that gap is survivable — a flood lands in an
-- approval queue and an admin bins it. This feature publishes
-- immediately to ~2,000 people, so the same gap is a live megaphone.
--
-- The ceilings below sit ABOVE the Upstash ones deliberately. Upstash
-- stays the limit members experience; these are the floor under it that
-- a forged request cannot get beneath. Equal numbers would let the two
-- race on their differing windows and surface the blunt database error
-- instead of the written one.
--
--   Upstash            database backstop
--   post    10 / 24h   15 / 24h
--   report   5 / 24h   10 / 24h
--   upload  40 / 24h   60 outstanding tickets

create or replace function public.issue_upload_ticket(p_purpose text default 'post_image')
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_key    text;
  v_open   int;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can upload images' using errcode = '42501';
  end if;
  if p_purpose <> 'post_image' then
    raise exception 'Unsupported upload purpose: %', p_purpose using errcode = '22023';
  end if;
  if not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  -- Outstanding, not issued-per-hour. An unconsumed ticket is a blob
  -- nobody references, so what needs bounding is how many a single member
  -- can have in flight — and the hourly sweep clears anything past 24h,
  -- which makes this a genuine ceiling rather than a running total.
  select count(*) into v_open
    from public.upload_tickets t
   where t.user_id = v_caller
     and t.consumed_at is null;
  if v_open >= 60 then
    raise exception 'Too many uploads in progress. Finish or discard a post first.'
      using errcode = '42501';
  end if;

  -- uuid, then the extension the gateway will actually write. The gateway
  -- re-encodes everything to WebP, so the key names the output format,
  -- not whatever was uploaded.
  v_key := gen_random_uuid()::text || '.webp';

  insert into public.upload_tickets (blob_key, user_id, purpose)
  values (v_key, v_caller, p_purpose);

  return v_key;
end;
$$;

revoke execute on function public.issue_upload_ticket(text) from public, anon;
grant  execute on function public.issue_upload_ticket(text) to authenticated;


create or replace function public.create_post(
  p_title  text,
  p_body   text,
  p_images jsonb default '[]'::jsonb
)
returns table (
  id                uuid,
  created_at        timestamptz,
  expires_at        timestamptz,
  author_first_name text,
  author_surname    text,
  author_role       user_role
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller  uuid := auth.uid();
  v_post_id uuid;
  v_count   int;
  v_img     jsonb;
  v_pos     smallint := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can post' using errcode = '42501';
  end if;
  if not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  if jsonb_typeof(p_images) <> 'array' then
    raise exception 'create_post: p_images must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_images) > 2 then
    raise exception 'A post can have at most 2 images' using errcode = '22023';
  end if;

  -- Rate backstop. Served by posts_author_feed_idx (author_id first), so
  -- this is an index range scan over one member's last day, not a table
  -- scan. Racy under concurrency — two simultaneous requests can both see
  -- 14 — and that is fine for a backstop whose job is to stop a loop, not
  -- to be exact.
  select count(*) into v_count
    from public.posts p
   where p.author_id = v_caller
     and p.kind = 'member'
     and p.created_at > now() - interval '24 hours';
  if v_count >= 15 then
    raise exception 'You have reached the daily posting limit.' using errcode = '42501';
  end if;

  -- Duplicate suppression. Catches the double-submit (a member clicking
  -- Post twice on a slow connection) and the laziest form of spam, and it
  -- does so without spending a rate-limit token on either.
  --
  -- Every column is table-qualified. `returns table (...)` declares OUT
  -- parameters named id / created_at / expires_at, and an unqualified
  -- reference to one of those inside the body resolves to the parameter
  -- rather than the column — Postgres rejects it as ambiguous at runtime,
  -- not at create time, so it fails on first call rather than on deploy.
  select count(*) into v_count
    from public.posts p
   where p.author_id = v_caller
     and p.kind = 'member'
     and p.title = p_title
     and p.body = p_body
     and p.created_at > now() - interval '24 hours';
  if v_count > 0 then
    raise exception 'You have already posted this in the last 24 hours' using errcode = '23505';
  end if;

  insert into public.posts (author_id, kind, title, body)
  values (v_caller, 'member', p_title, p_body)
  returning posts.id into v_post_id;  -- qualified: `id` is also an OUT param

  for v_img in select * from jsonb_array_elements(p_images)
  loop
    v_pos := v_pos + 1;

    -- Claim the ticket. The WHERE clause is the whole check: it must
    -- exist, belong to this caller, be for this purpose, and be unused.
    -- `not found` after this means at least one of those was false.
    update public.upload_tickets
       set consumed_at = now()
     where blob_key    = v_img->>'blob_key'
       and user_id     = v_caller
       and purpose     = 'post_image'
       and consumed_at is null;
    if not found then
      raise exception 'Image upload is no longer valid — please re-attach it'
        using errcode = '42501';
    end if;

    insert into public.post_images (post_id, blob_key, alt_text, width, height, byte_size, position)
    values (
      v_post_id,
      v_img->>'blob_key',
      v_img->>'alt_text',
      (v_img->>'width')::int,
      (v_img->>'height')::int,
      (v_img->>'byte_size')::int,
      v_pos
    );
  end loop;

  return query
  select p.id, p.created_at, p.expires_at, pr.first_name, pr.surname, pr.role
    from public.posts p
    join public.profiles pr on pr.id = p.author_id
   where p.id = v_post_id;
end;
$$;

revoke execute on function public.create_post(text, text, jsonb) from public, anon;
grant  execute on function public.create_post(text, text, jsonb) to authenticated;


create or replace function public.report_post(
  p_post_id  uuid,
  p_category text,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_title  text;
  v_author uuid;
  v_count  int;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can report posts' using errcode = '42501';
  end if;

  -- Backstop against report-bombing driven straight at the RPC. The
  -- unique index already stops repeat reports of the SAME post; this is
  -- what stops one member working through everyone else's.
  select count(*) into v_count
    from public.post_reports r
   where r.reporter_id = v_caller
     and r.created_at > now() - interval '24 hours';
  if v_count >= 10 then
    raise exception 'You have reported several posts today. Please email us if something urgent needs attention.'
      using errcode = '42501';
  end if;

  select title, author_id into v_title, v_author from public.posts where id = p_post_id;
  if v_title is null then
    raise exception 'Post not found — it may have already been deleted';
  end if;
  if v_author = v_caller then
    raise exception 'You cannot report your own post';
  end if;

  insert into public.post_reports (post_id, post_title_snapshot, reporter_id, category, reason)
  values (p_post_id, v_title, v_caller, p_category, trim(p_reason))
  on conflict do nothing;
end;
$$;

revoke execute on function public.report_post(uuid, text, text) from public, anon;
grant  execute on function public.report_post(uuid, text, text) to authenticated;


-- ─── 3. Expired posts leave the feed on time ────────────────────────
-- purge_expired_posts runs hourly, so between expiry and the next run a
-- post could still be read. The privacy page says seven days; making the
-- read honour expires_at means the member-visible promise is exact and
-- the cron is only responsible for reclaiming the row and the bytes.
--
-- Costs nothing: the filter discards at most one hour of rows from a
-- window the index has already narrowed.
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
  images            jsonb
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
    )
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.expires_at > now()
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_community_feed(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_community_feed(timestamptz, uuid, int) to authenticated;


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
  images     jsonb
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
    )
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

revoke execute on function public.list_my_posts(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_my_posts(timestamptz, uuid, int) to authenticated;


-- ─── 4. A stable order for the admin report queue ───────────────────
-- `order by created_at desc` alone is not a total order. Two reports
-- filed in the same tick can swap places between page 1 and page 2, so a
-- report is shown twice and another never at all — on a queue whose whole
-- job is that nothing gets missed. `id` breaks the tie deterministically.
create or replace function public.admin_list_post_reports(
  p_status text default 'open',
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id                  uuid,
  post_id             uuid,
  post_title_snapshot text,
  post_still_exists   boolean,
  category            text,
  reason              text,
  status              text,
  created_at          timestamptz,
  resolved_at         timestamptz,
  resolution_note     text,
  reporter_first_name text,
  reporter_surname    text,
  author_first_name   text,
  author_surname      text,
  author_id           uuid,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  return query
  with matched as (
    select r.*, p.author_id as post_author_id
      from public.post_reports r
      left join public.posts p on p.id = r.post_id
     where p_status is null or p_status = 'all' or r.status = p_status
  ),
  counted as (
    select m.*, count(*) over () as total_count from matched m
  )
  select
    c.id, c.post_id, c.post_title_snapshot, (c.post_id is not null),
    c.category, c.reason, c.status, c.created_at, c.resolved_at, c.resolution_note,
    rep.first_name, rep.surname,
    auth_p.first_name, auth_p.surname, c.post_author_id,
    c.total_count
  from counted c
  left join public.profiles rep    on rep.id    = c.reporter_id
  left join public.profiles auth_p on auth_p.id = c.post_author_id
  order by c.created_at desc, c.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke execute on function public.admin_list_post_reports(text, int, int) from public, anon;
grant  execute on function public.admin_list_post_reports(text, int, int) to authenticated, service_role;

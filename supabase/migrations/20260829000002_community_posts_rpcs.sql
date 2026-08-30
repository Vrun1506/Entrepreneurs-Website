-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — RPCs
--
-- Every write goes through a SECURITY DEFINER function rather than an
-- RLS insert policy, for the same reason submit_opportunity does: the
-- checks that matter (kill switch, upload-ticket ownership, duplicate
-- suppression) have to happen in the same transaction as the insert, and
-- a `with check` expression cannot express them.
--
-- Every guard is `is_approved() or is_admin()`, never `auth.uid() is not
-- null`. A ban here is `status = 'rejected'` and GoTrue's banned_until
-- takes up to an hour to invalidate an already-issued JWT, so a
-- just-banned member still presents a perfectly valid auth.uid(). That
-- was the bug 20260827000003 was written to fix; this file does not
-- reintroduce it.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Kill switch ─────────────────────────────────────────────────
-- app_config has no RLS policies at all, so authenticated cannot read it
-- directly — a definer function is the only way application code can see
-- a flag stored there. Default is CLOSED: if the row is missing (a fresh
-- database, a botched seed), posting is off rather than silently on.
--
-- This is the lever for the 2am problem — a spam wave, or a complaint
-- about the feature itself. One UPDATE, no deploy.
create or replace function public.posting_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value = 'true' from public.app_config where key = 'community_posts_enabled'),
    false
  );
$$;

revoke execute on function public.posting_enabled() from public, anon;
grant  execute on function public.posting_enabled() to authenticated;


-- ─── 2. issue_upload_ticket ─────────────────────────────────────────
-- Records that a blob key was legitimately handed to this member, so
-- create_post can later verify a submitted key instead of trusting a
-- string from the browser.
--
-- The key is generated HERE, not by the client. The CV spec sets the same
-- rule for the same reason: a user-supplied filename must never become a
-- path component.
create or replace function public.issue_upload_ticket(p_purpose text default 'post_image')
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_key    text;
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


-- ─── 3. create_post ─────────────────────────────────────────────────
-- p_images shape (0 to 2 entries):
--   [{"blob_key":"…","alt_text":"…","width":n,"height":n,"byte_size":n}]
--
-- The ticket check is the security boundary. Without it, a client could
-- submit any blob key — including one belonging to another member's post
-- — and attach someone else's image to its own words.
-- Returns the created row rather than just its id. The composer prepends the
-- new post to the feed it is already showing, so it needs the values the
-- database generated — created_at, expires_at — and the author's display
-- name. Returning them here makes that one round trip and, more importantly,
-- means the countdown on the new card comes from the same clock as the
-- purge job rather than from a second calculation in TypeScript that could
-- drift from it.
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


-- ─── 4. delete_my_post ──────────────────────────────────────────────
-- Ownership is re-checked in the body rather than left to the RLS policy,
-- matching update_opportunity: inside a SECURITY DEFINER function the
-- policy does not apply, so the body IS the security boundary.
create or replace function public.delete_my_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_author uuid;
  v_kind   text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select author_id, kind into v_author, v_kind
    from public.posts where id = p_post_id;
  if v_author is null then
    raise exception 'Post not found — it may have already been deleted';
  end if;
  if v_author <> v_caller then
    raise exception 'You can only delete your own posts' using errcode = '42501';
  end if;
  if v_kind <> 'member' then
    raise exception 'This post was created from a listing — remove the listing instead';
  end if;

  -- No moderation log row: the author removing their own words is not a
  -- moderation event, and recording it would retain content we were asked
  -- to destroy. Images follow via cascade; the trigger schedules the bytes.
  delete from public.posts where id = p_post_id;
end;
$$;

revoke execute on function public.delete_my_post(uuid) from public, anon;
grant  execute on function public.delete_my_post(uuid) to authenticated;


-- ─── 5. admin_delete_post ───────────────────────────────────────────
-- Returns the author's identity so the server action can send the
-- takedown notice — the same shape reject_opportunity uses since
-- 20260529000006, and for the same reason: the cascade destroys the
-- identity, so it has to be captured before the delete, not looked up
-- after it.
create or replace function public.admin_delete_post(p_post_id uuid, p_reason text)
returns table (email text, first_name text, title text, posted_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_post   public.posts%rowtype;
  v_email  text;
  v_first  text;
  v_images smallint;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if v_post.id is null then
    raise exception 'Post not found: %', p_post_id;
  end if;

  select au.email::text, p.first_name into v_email, v_first
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = v_post.author_id;

  select count(*) into v_images from public.post_images where post_id = p_post_id;

  -- Written BEFORE the delete. The snapshot is the point: "we removed a
  -- post for reason X" without the post is close to worthless the moment
  -- someone appeals, and an appeal is the only time this is ever read.
  insert into public.post_moderation_log (
    post_id, author_id, author_email_snapshot, admin_id, reason,
    title_snapshot, body_snapshot, image_count, posted_at
  )
  values (
    p_post_id, v_post.author_id, v_email, v_caller, trim(p_reason),
    v_post.title, v_post.body, v_images, v_post.created_at
  );

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_delete_post', 'posts', p_post_id, trim(p_reason));

  -- Any open reports about this post are now resolved by definition.
  update public.post_reports
     set status = 'actioned', resolved_by = v_caller, resolved_at = now(),
         resolution_note = 'Post removed by an admin.'
   where post_id = p_post_id and status = 'open';

  delete from public.posts where id = p_post_id;

  return query select v_email, v_first, v_post.title, v_post.created_at;
end;
$$;

revoke execute on function public.admin_delete_post(uuid, text) from public, anon;
grant  execute on function public.admin_delete_post(uuid, text) to authenticated, service_role;


-- ─── 6. report_post ─────────────────────────────────────────────────
-- Idempotent by way of the unique index: reporting twice succeeds
-- silently rather than erroring. Telling someone "you already reported
-- this" is a small information leak and no help to them.
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
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can report posts' using errcode = '42501';
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


-- ─── 7. admin_resolve_post_report ───────────────────────────────────
-- Returns the reporter's identity so the action can close the loop by
-- email. Telling a complainant what happened is the half of a complaints
-- process that is easiest to skip and the half that makes it real.
create or replace function public.admin_resolve_post_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
)
returns table (email text, first_name text, post_title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_report public.post_reports%rowtype;
  v_email  text;
  v_first  text;
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  if p_status not in ('actioned', 'dismissed') then
    raise exception 'Status must be actioned or dismissed' using errcode = '22023';
  end if;

  select * into v_report from public.post_reports where id = p_report_id;
  if v_report.id is null then
    raise exception 'Report not found: %', p_report_id;
  end if;
  if v_report.status <> 'open' then
    raise exception 'That report has already been resolved';
  end if;

  update public.post_reports
     set status = p_status, resolved_by = v_caller, resolved_at = now(),
         resolution_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_report_id;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_caller, 'admin_resolve_post_report', 'post_reports', p_report_id,
          p_status || coalesce(': ' || nullif(trim(coalesce(p_note, '')), ''), ''));

  -- reporter_id is nullable (the reporter may have deleted their account
  -- since), so this can legitimately return no address.
  select au.email::text, p.first_name into v_email, v_first
    from auth.users au
    left join public.profiles p on p.id = au.id
   where au.id = v_report.reporter_id;

  return query select v_email, v_first, v_report.post_title_snapshot;
end;
$$;

revoke execute on function public.admin_resolve_post_report(uuid, text, text) from public, anon;
grant  execute on function public.admin_resolve_post_report(uuid, text, text) to authenticated, service_role;


-- ─── 8. Feed reads (keyset) ─────────────────────────────────────────
-- Keyset, not offset, because this is a feed and not a filtered list.
--
--   * Cost is constant with depth. Offset makes Postgres walk and discard
--     every skipped row, so page 50 costs fifty times page 1; a keyset
--     seek descends the index once whatever the depth.
--   * It cannot skip rows. The expiry job deletes posts underneath a
--     reader — with offset, a row removed above the window shifts
--     everything up and the next page silently omits a post. A cursor is
--     anchored to a row, not to a count.
--   * No count(*) over (). That window function scans the whole matched
--     set on every request and is the part that actually degrades; "load
--     more" does not need a total.
--
-- The RLS gate is re-asserted in the body: SECURITY DEFINER means the
-- policies on `posts` do not apply here.
--
-- Images ride along as a jsonb array rather than a second query, so
-- rendering a page of the feed is one round trip.
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
  where p_cursor_created_at is null
     or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id)
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_community_feed(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_community_feed(timestamptz, uuid, int) to authenticated;


-- Same cursor shape, scoped to the caller. System posts are excluded:
-- "My posts" means what you wrote here, and a system post is not
-- deletable from this page, so listing it would only offer a control that
-- does not work.
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
    and (p_cursor_created_at is null
         or (p.created_at, p.id) < (p_cursor_created_at, p_cursor_id))
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;

revoke execute on function public.list_my_posts(timestamptz, uuid, int) from public, anon;
grant  execute on function public.list_my_posts(timestamptz, uuid, int) to authenticated;


-- ─── 9. Admin report queue (offset) ─────────────────────────────────
-- Offset here, unlike the feed, because this is a filtered admin list
-- where "12 open reports, page 2 of 3" is the useful framing and the
-- reader wants a total. Same shape as admin_list_profiles: the count
-- rides on every row via a window function, so there is no second query.
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
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

revoke execute on function public.admin_list_post_reports(text, int, int) from public, anon;
grant  execute on function public.admin_list_post_reports(text, int, int) to authenticated, service_role;

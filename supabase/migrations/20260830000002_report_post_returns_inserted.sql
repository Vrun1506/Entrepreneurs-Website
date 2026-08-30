-- ════════════════════════════════════════════════════════════════════
-- Foundry · report_post tells the caller whether it actually filed
--
-- The Online Safety Act asks a user-to-user service to act on illegal
-- content once it knows about it. "Knowing" cannot mean a row in a table
-- somebody has to remember to open: a report nobody reads is worse than no
-- report button, because it is a documented notification that was
-- demonstrably ignored.
--
-- So a report now emails the moderation inbox. For that, the action has to
-- know whether a row was really inserted — report_post is idempotent by way
-- of the unique index and quietly swallows a repeat, and re-notifying on
-- every duplicate would train whoever reads that inbox to ignore it.
--
-- It returns the post title too, read from the database rather than taken
-- from the caller, for the same reason.
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres cannot change a
-- function's return type in place. The drop names the exact argument
-- signature so it removes this function rather than leaving a dead overload
-- behind — the trap 20260601000000 records.
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.report_post(uuid, text, text);

create function public.report_post(
  p_post_id  uuid,
  p_category text,
  p_reason   text
)
returns table (filed boolean, post_title text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller   uuid := auth.uid();
  v_title    text;
  v_author   uuid;
  v_count    int;
  v_inserted boolean := false;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not (public.is_approved() or public.is_admin()) then
    raise exception 'Only approved members can report posts' using errcode = '42501';
  end if;

  -- Backstop against report-bombing driven straight at the RPC. The unique
  -- index already stops repeat reports of the SAME post; this is what stops
  -- one member working through everyone else's.
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

  -- FOUND after an INSERT ... ON CONFLICT DO NOTHING is false when the
  -- conflict fired. That is the whole signal: true means this is news.
  get diagnostics v_count = row_count;
  v_inserted := v_count > 0;

  -- The title comes from the database, never from the caller. It lands in a
  -- moderator's inbox, and a client-supplied one would let a reporter
  -- describe someone else's post however they liked.
  return query select v_inserted, v_title;
end;
$$;

revoke execute on function public.report_post(uuid, text, text) from public, anon;
grant  execute on function public.report_post(uuid, text, text) to authenticated;

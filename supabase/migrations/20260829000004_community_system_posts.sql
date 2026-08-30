-- ════════════════════════════════════════════════════════════════════
-- Foundry · System posts — keep the Community feed from launching empty
--
-- A new feed's real risk is not too much content, it is too little. A
-- Community tab showing four posts reads as abandoned, and members stop
-- checking it before it ever gets going. So when an opportunity, event or
-- VC/grant is approved, the feed gains a card pointing at it — the
-- listings already flowing through the review queue seed the feed for
-- free, and they carry traffic back to the listing pages.
--
-- WHY TRIGGERS AND NOT EDITS TO THE APPROVE RPCS.
-- The obvious implementation is an INSERT inside approve_opportunity,
-- approve_event, approve_vc_grant and the three admin_create_* twins.
-- That is six `create or replace` statements against large existing
-- functions, and this codebase has been bitten twice by exactly that:
-- once by a dead overload when a signature drifted (20260601000000), and
-- once by the fact that `create or replace` re-runs Supabase's default
-- privileges and silently hands `anon` a fresh EXECUTE grant
-- (20260827000001). Six rewrites is six chances at both.
--
-- A trigger on the status column touches none of that, and covers more:
-- approve_* (an UPDATE to 'approved'), admin_create_* (an INSERT already
-- at 'approved'), and any future path including a manual UPDATE in the
-- SQL editor.
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. Shared insert ───────────────────────────────────────────────
-- Truncates to the column constraints rather than letting a long listing
-- description raise. A system post is a pointer to the listing, not a
-- copy of it, so losing the tail is the correct outcome.
--
-- The length floor matters: posts_title_len requires 3 characters, and a
-- listing row that somehow has a shorter title must not make approving it
-- fail. Skipping the feed card is a much better failure than blocking the
-- approval.
create or replace function public.create_system_post(
  p_source_table text,
  p_source_id    uuid,
  p_author_id    uuid,
  p_title        text,
  p_body         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 120);
  v_body  text := left(trim(coalesce(p_body,  '')), 3000);
begin
  if length(v_title) < 3 or length(v_body) < 1 then
    return;
  end if;

  -- `on conflict do nothing` against posts_system_source_idx. Re-approving
  -- a listing after an edit, or a double-clicked approve button, must not
  -- stack duplicate cards in the feed.
  insert into public.posts (author_id, kind, title, body, source_table, source_id)
  values (p_author_id, 'system', v_title, v_body, p_source_table, p_source_id)
  on conflict do nothing;
end;
$$;

revoke execute on function public.create_system_post(text, uuid, uuid, text, text)
  from public, anon, authenticated;


-- ─── 2. Per-table triggers ──────────────────────────────────────────
-- Each fires on the transition INTO 'approved' (and on an insert that is
-- already approved), and removes the card on the transition back out —
-- rejected, or expired. A listing that is no longer live should not still
-- be advertised in the feed; without that the card would linger until the
-- 7-day expiry caught it.
create or replace function public.tg_opportunity_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.create_system_post(
      'opportunities', new.id, new.posted_by,
      new.position_name || ' at ' || new.company,
      new.description
    );
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.posts
     where kind = 'system' and source_table = 'opportunities' and source_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.tg_event_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.create_system_post(
      'events', new.id, new.posted_by,
      new.title,
      new.description
    );
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.posts
     where kind = 'system' and source_table = 'events' and source_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.tg_vc_grant_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.create_system_post(
      'vcs_grants', new.id, new.posted_by,
      new.name,
      new.description
    );
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.posts
     where kind = 'system' and source_table = 'vcs_grants' and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_system_post on public.opportunities;
create trigger opportunities_system_post
  after insert or update of status on public.opportunities
  for each row execute function public.tg_opportunity_system_post();

drop trigger if exists events_system_post on public.events;
create trigger events_system_post
  after insert or update of status on public.events
  for each row execute function public.tg_event_system_post();

drop trigger if exists vcs_grants_system_post on public.vcs_grants;
create trigger vcs_grants_system_post
  after insert or update of status on public.vcs_grants
  for each row execute function public.tg_vc_grant_system_post();


-- ─── 3. Cleanup on listing deletion ─────────────────────────────────
-- source_id cannot be a real foreign key — it points at one of three
-- tables — so there is no cascade to lean on. Without these, deleting a
-- listing would leave a feed card linking to a 404 until the 7-day expiry
-- collected it.
create or replace function public.tg_delete_system_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.posts
   where kind = 'system'
     and source_table = tg_table_name
     and source_id = old.id;
  return old;
end;
$$;

drop trigger if exists opportunities_delete_system_post on public.opportunities;
create trigger opportunities_delete_system_post
  after delete on public.opportunities
  for each row execute function public.tg_delete_system_post();

drop trigger if exists events_delete_system_post on public.events;
create trigger events_delete_system_post
  after delete on public.events
  for each row execute function public.tg_delete_system_post();

drop trigger if exists vcs_grants_delete_system_post on public.vcs_grants;
create trigger vcs_grants_delete_system_post
  after delete on public.vcs_grants
  for each row execute function public.tg_delete_system_post();


-- ─── 4. Grant lockdown ──────────────────────────────────────────────
-- Trigger functions do not need EXECUTE to fire, so revoking costs
-- nothing and stops them being callable directly. All three roles named,
-- per 20260608000001.
revoke execute on function public.tg_opportunity_system_post() from public, anon, authenticated;
revoke execute on function public.tg_event_system_post()       from public, anon, authenticated;
revoke execute on function public.tg_vc_grant_system_post()    from public, anon, authenticated;
revoke execute on function public.tg_delete_system_post()      from public, anon, authenticated;

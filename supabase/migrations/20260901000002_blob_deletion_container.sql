-- ════════════════════════════════════════════════════════════════════
-- Foundry · blob_deletion_queue becomes container-aware
--
-- Every row queued so far implicitly means "in post-images" — the only
-- container that existed. With profile-pictures and member-cvs added,
-- the drain (app/api/cron/drain-blob-deletions) and the gateway's
-- delete endpoint both need to know WHICH container a key lives in, or
-- a CV key gets looked up in post-images and "deleted" (404, reported
-- as already-gone) while the actual bytes sit untouched.
--
-- Default 'post-images' makes every already-queued and already-written
-- row correct without a backfill: nothing produced a key for any other
-- container before this migration.
--
-- This is a compliance path, not housekeeping — see 20260829000001 §7.
-- The same argument now applies to a member's photo and CV: if this
-- queue silently misses a container, "we deleted it" stops being true.
-- ════════════════════════════════════════════════════════════════════

alter table public.blob_deletion_queue
  add column if not exists container text not null default 'post-images';

alter table public.blob_deletion_queue
  drop constraint if exists blob_deletion_queue_container_check;

alter table public.blob_deletion_queue
  add constraint blob_deletion_queue_container_check check (
    container in ('post-images', 'profile-pictures', 'member-cvs'));

-- ─── Deletion trigger for profiles.avatar_path / cv_path ────────────
-- Mirrors tg_enqueue_blob_deletion (20260829000001 §7) for the two new
-- media columns. Two cases in one function:
--   UPDATE — the OLD value is replaced (a fresh upload, or removal).
--            confirm_avatar_upload / confirm_cv_upload / remove_my_*
--            already enqueue the old key themselves before writing, so
--            this only needs to catch a bare UPDATE from any other
--            path (an admin fixup, admin_clear_avatar's own UPDATE —
--            harmless double-enqueue there since the drain treats a
--            404 as already-gone, never an error).
--   DELETE — the whole profile row is gone (delete_my_account,
--            admin_delete_user). Both columns' bytes must go with it.
create or replace function public.tg_enqueue_profile_media_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.avatar_path is not null then
      insert into public.blob_deletion_queue (blob_key, container)
      values (old.avatar_path, 'profile-pictures');
    end if;
    if old.cv_path is not null then
      insert into public.blob_deletion_queue (blob_key, container)
      values (old.cv_path, 'member-cvs');
    end if;
    return old;
  end if;

  -- TG_OP = 'UPDATE'
  if new.avatar_path is distinct from old.avatar_path and old.avatar_path is not null then
    insert into public.blob_deletion_queue (blob_key, container)
    values (old.avatar_path, 'profile-pictures');
  end if;
  if new.cv_path is distinct from old.cv_path and old.cv_path is not null then
    insert into public.blob_deletion_queue (blob_key, container)
    values (old.cv_path, 'member-cvs');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enqueue_media_deletion on public.profiles;
create trigger profiles_enqueue_media_deletion
  after update or delete on public.profiles
  for each row
  execute function public.tg_enqueue_profile_media_deletion();

revoke execute on function public.tg_enqueue_profile_media_deletion()
  from public, anon, authenticated;

-- ─── claim_blob_deletion_batch gains container in its return type ────
-- The Next.js drain needs to know which container each key lives in to
-- tell the gateway's now-container-aware /v1/blobs/delete which one to
-- delete from — without this it would keep assuming post-images for
-- every claimed row, silently failing to ever delete an avatar or a CV.
-- Return-type change, so DROP + CREATE, not a plain replace.
drop function if exists public.claim_blob_deletion_batch(int);

create or replace function public.claim_blob_deletion_batch(p_limit int default 50)
returns table (
  id           uuid,
  blob_key     text,
  container    text,
  attempts     int,
  max_attempts int
)
language sql
security definer
set search_path = public
as $$
  update public.blob_deletion_queue q
     set next_attempt_at = now() + interval '10 minutes'
   where q.id in (
     select id from public.blob_deletion_queue
      where deleted_at is null
        and attempts < max_attempts
        and next_attempt_at <= now()
      order by enqueued_at
      limit p_limit
      for update skip locked
   )
  returning q.id, q.blob_key, q.container, q.attempts, q.max_attempts;
$$;

revoke execute on function public.claim_blob_deletion_batch(int) from public, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Profile photo + CV columns, and the RPCs that write them
--
-- avatar_path already exists (20260828000003) with a write-protection
-- trigger — a member cannot set it directly, only the upload service
-- (service_role) or an admin can. cv_path needs the identical
-- protection for the identical reason: a member who could write their
-- own cv_path could point it at someone else's CV.
--
-- Both columns are written ONLY through confirm_avatar_upload /
-- confirm_cv_upload below, which run as the service role would (this
-- migration keeps them SECURITY DEFINER rather than routing through
-- the FastAPI gateway's service-role key, since the gateway holds no
-- DB connection at all — see server/app/main.py's docstring). Each
-- verifies an upload_tickets row was actually issued to the caller for
-- that exact blob key before writing, so a client cannot point either
-- column at an arbitrary key it never uploaded to.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists cv_path              text,
  add column if not exists cv_uploaded_at        timestamptz,
  add column if not exists cv_original_filename  text,
  add column if not exists cv_parse_consent      boolean not null default false,
  add column if not exists cv_parse_consent_at   timestamptz;

alter table public.profiles
  drop constraint if exists profiles_cv_path_len,
  drop constraint if exists profiles_cv_original_filename_len;

alter table public.profiles
  add constraint profiles_cv_path_len check (
    cv_path is null or length(cv_path) <= 400),
  add constraint profiles_cv_original_filename_len check (
    -- Display only, never a path component — validated at the length a
    -- filename plausibly needs, not at path-safety, because it is never
    -- interpreted as a path anywhere in this system.
    cv_original_filename is null or length(cv_original_filename) <= 255);

-- ─── cv_path is not user-writable, same rule as avatar_path ───────────
-- Replaces 20260828000003's function to add the second guarded column.
-- Same signature, same trigger name — this REPLACES the live function
-- and reattaches the same trigger rather than creating a second one.
create or replace function public.tg_profiles_protect_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path
     or new.cv_path is distinct from old.cv_path then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if public.is_admin() then
      return new;
    end if;
    -- Trusted-call marker, same pattern as tg_profiles_protect_status's
    -- foundry.onboarding_submission (20260531000003). confirm_avatar_upload,
    -- remove_my_avatar, confirm_cv_upload and remove_my_cv all set this GUC
    -- immediately before their UPDATE. Transaction-local, so it cannot
    -- persist between requests, and not user-settable from outside a
    -- SECURITY DEFINER function (PostgREST does not expose set_config).
    -- WITHOUT THIS CHECK every one of those RPCs would trip this trigger
    -- on an ordinary member's own upload — auth.role() stays 'authenticated'
    -- inside a SECURITY DEFINER function, it does not become 'service_role'.
    if coalesce(current_setting('foundry.media_write', true), '') = 'true' then
      return new;
    end if;
    raise exception 'avatar_path and cv_path are set by the upload service, not directly'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_avatar_path on public.profiles;
create trigger profiles_protect_avatar_path
  before update on public.profiles
  for each row execute function public.tg_profiles_protect_avatar_path();

revoke execute on function public.tg_profiles_protect_avatar_path()
  from public, anon, authenticated;

-- ─── confirm_avatar_upload ─────────────────────────────────────────
-- Called from a server action AFTER that action has verified the blob
-- actually exists (blobsExist() against the profile-pictures
-- container) — this function cannot see Azure, only the ticket table,
-- so "a ticket was issued" is all it can prove on its own. Mirrors
-- create_post's division of labour for the identical reason.
create or replace function public.confirm_avatar_upload(p_blob_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.upload_tickets
     where blob_key = p_blob_key
       and user_id = v_caller
       and purpose = 'profile_picture'
       and consumed_at is null
  ) then
    raise exception 'That upload ticket is invalid, expired, or already used'
      using errcode = '42501';
  end if;

  update public.upload_tickets
     set consumed_at = now()
   where blob_key = p_blob_key;

  -- The GUC lets the protect-avatar-path trigger through for this one
  -- write. Transaction-local (3rd arg = true) and reset before this
  -- function returns, mirroring submit_onboarding's fixed pattern
  -- (20260828000005) — never left raised across statements. The
  -- previous avatar_path (if any) is enqueued for deletion by
  -- profiles_enqueue_media_deletion (20260901000002), not here — one
  -- trigger covering every UPDATE is what stops a future write path
  -- from forgetting to enqueue.
  perform set_config('foundry.media_write', 'true', true);
  update public.profiles set avatar_path = p_blob_key where id = v_caller;
  perform set_config('foundry.media_write', 'false', true);
end;
$$;

revoke execute on function public.confirm_avatar_upload(text) from public, anon;
grant  execute on function public.confirm_avatar_upload(text) to authenticated;

-- ─── remove_my_avatar ──────────────────────────────────────────────
create or replace function public.remove_my_avatar()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- No-op on a null column is fine: the trigger only enqueues when the
  -- old value was non-null, and an UPDATE that changes nothing is cheap.
  perform set_config('foundry.media_write', 'true', true);
  update public.profiles set avatar_path = null where id = v_caller;
  perform set_config('foundry.media_write', 'false', true);
end;
$$;

revoke execute on function public.remove_my_avatar() from public, anon;
grant  execute on function public.remove_my_avatar() to authenticated;

-- ─── confirm_cv_upload ─────────────────────────────────────────────
-- p_filename is the member's original filename, stored for display
-- only (the picker shows "cv_jan2026.pdf", not a uuid). It is never
-- used as a path component anywhere — cv_path (the uuid-based blob
-- key) is what every storage call uses.
create or replace function public.confirm_cv_upload(
  p_blob_key text,
  p_filename text,
  p_consent  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_name   text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.upload_tickets
     where blob_key = p_blob_key
       and user_id = v_caller
       and purpose = 'cv'
       and consumed_at is null
  ) then
    raise exception 'That upload ticket is invalid, expired, or already used'
      using errcode = '42501';
  end if;

  update public.upload_tickets
     set consumed_at = now()
   where blob_key = p_blob_key;

  v_name := nullif(trim(coalesce(p_filename, '')), '');
  if v_name is not null and length(v_name) > 255 then
    v_name := left(v_name, 255);
  end if;

  -- The previous cv_path (if any) is enqueued for deletion by
  -- profiles_enqueue_media_deletion (20260901000002), not here.
  perform set_config('foundry.media_write', 'true', true);
  update public.profiles
     set cv_path              = p_blob_key,
         cv_uploaded_at       = now(),
         cv_original_filename = v_name,
         cv_parse_consent     = coalesce(p_consent, false),
         cv_parse_consent_at  = case when p_consent then now() else null end
   where id = v_caller;
  perform set_config('foundry.media_write', 'false', true);
end;
$$;

revoke execute on function public.confirm_cv_upload(text, text, boolean) from public, anon;
grant  execute on function public.confirm_cv_upload(text, text, boolean) to authenticated;

-- ─── remove_my_cv ──────────────────────────────────────────────────
create or replace function public.remove_my_cv()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform set_config('foundry.media_write', 'true', true);
  update public.profiles
     set cv_path              = null,
         cv_uploaded_at       = null,
         cv_original_filename = null,
         cv_parse_consent     = false,
         cv_parse_consent_at  = null
   where id = v_caller;
  perform set_config('foundry.media_write', 'false', true);
end;
$$;

revoke execute on function public.remove_my_cv() from public, anon;
grant  execute on function public.remove_my_cv() to authenticated;

-- ─── admin_clear_avatar ────────────────────────────────────────────
-- Moderation for an offensive profile photo. Unlike community posts,
-- avatars have no report route at all — this is the only lever an
-- admin has. Logged to admin_actions because it is a moderation
-- action taken on someone else's data, same bar as the other rows in
-- that table.
create or replace function public.admin_clear_avatar(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  perform set_config('foundry.media_write', 'true', true);
  update public.profiles set avatar_path = null where id = p_profile_id;
  perform set_config('foundry.media_write', 'false', true);

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_admin, 'clear_avatar', 'profiles', p_profile_id, null);
end;
$$;

revoke execute on function public.admin_clear_avatar(uuid) from public, anon, authenticated;
grant  execute on function public.admin_clear_avatar(uuid) to authenticated;

-- ─── admin_log_cv_access ───────────────────────────────────────────
-- Admin CV access is PERMITTED (abuse handling, DSARs) but never
-- silent. Called by the server action immediately before it mints a
-- read SAS for an admin viewing a member's CV — see
-- lib/storage/blobRead.ts:signedCvUrl. Writes to admin_actions, which
-- already has exactly this shape (admin_id, action, target_table,
-- target_id, created_at). Never blocks the read on failure to log —
-- see the server action, not this function, for that ordering.
create or replace function public.admin_log_cv_access(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;

  insert into public.admin_actions (admin_id, action, target_table, target_id, notes)
  values (v_admin, 'view_cv', 'profiles', p_profile_id, null);
end;
$$;

revoke execute on function public.admin_log_cv_access(uuid) from public, anon, authenticated;
grant  execute on function public.admin_log_cv_access(uuid) to authenticated;

-- ─── cv_path is not readable via a raw table select, even by the owner ──
-- profiles_select_directory (20260527000002) lets any APPROVED member
-- read any OTHER approved member's full row — that is by design, for
-- directory browsing, and RLS is ROW-level: it cannot say "only your
-- own cv_path". Without this, any member could run
-- `supabase.from('profiles').select('cv_path').eq('id', someoneElseId)`
-- directly against PostgREST — bypassing every RPC and every check this
-- migration otherwise adds — and read the blob key of a CV that was
-- never theirs to see. avatar_path is deliberately NOT included here:
-- a profile photo is meant to be visible to the whole membership, which
-- is why list_directory_cards returns it explicitly.
--
-- Column-level REVOKE is what makes this a hard boundary rather than a
-- convention: it applies regardless of which row-level policy would
-- otherwise have let the row through, and it applies to the OWNER's own
-- row too — which is why get_my_cv_info() below exists as the one
-- legitimate way back in.
--
-- NOT done here: a column-level REVOKE on top of an existing table-wide
-- SELECT grant is a no-op in Postgres — `authenticated` and `anon` already
-- hold table-level SELECT on profiles (20260527000002), and a table-level
-- grant implies every column regardless of any narrower REVOKE issued
-- afterward. Confirmed live: `rls_smoke.sql` caught this outright, the raw
-- column REVOKE that used to sit here changed nothing. The only privilege
-- model that actually restricts a column is REVOKE the table-level SELECT
-- and GRANT SELECT back for an explicit column list — which has to name
-- every profiles column that exists once intake finishes adding its own
-- (20260901000004), so that fix lives at the end of this migration chain,
-- in 20260901000009_lock_cv_columns.sql, not here.

-- ─── get_my_cv_info ────────────────────────────────────────────────
-- The one legitimate read path for the columns just locked down: the
-- owner's own CV metadata, for the My Profile page. Never returns
-- another member's row — there is no parameter naming one.
create or replace function public.get_my_cv_info()
returns table (
  cv_path              text,
  cv_original_filename text,
  cv_uploaded_at       timestamptz,
  cv_parse_consent     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select cv_path, cv_original_filename, cv_uploaded_at, cv_parse_consent
    from public.profiles
   where id = auth.uid();
$$;

revoke execute on function public.get_my_cv_info() from public, anon;
grant  execute on function public.get_my_cv_info() to authenticated;

-- ─── admin_get_cv_info ─────────────────────────────────────────────
-- The admin equivalent, for the CV-download button on the admin member
-- view. Deliberately separate from get_my_cv_info rather than one
-- function branching on is_admin() — a caller-scoped function that can
-- also take an arbitrary target id is exactly the shape that is easy to
-- misuse from a future call site that forgets to check whose id it is
-- passing. Logging happens in the caller (the server action calls
-- admin_log_cv_access separately, before this), not fused into this
-- read, so a metadata fetch for a "does this member even have a CV"
-- check doesn't itself count as an access in the audit log.
create or replace function public.admin_get_cv_info(p_profile_id uuid)
returns table (
  cv_path              text,
  cv_original_filename text,
  cv_uploaded_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: not an admin' using errcode = '42501';
  end if;
  return query
    select p.cv_path, p.cv_original_filename, p.cv_uploaded_at
      from public.profiles p
     where p.id = p_profile_id;
end;
$$;

revoke execute on function public.admin_get_cv_info(uuid) from public, anon, authenticated;
grant  execute on function public.admin_get_cv_info(uuid) to authenticated;

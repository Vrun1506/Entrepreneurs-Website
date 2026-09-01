-- ════════════════════════════════════════════════════════════════════
-- Foundry · Async CV-skill suggestions
--
-- confirmCvUpload() used to download the CV, extract its text and match
-- it against the skills taxonomy before returning — a slow synchronous
-- chain sitting on the upload request. It now returns as soon as
-- confirm_cv_upload succeeds and does the extraction in Next's after(),
-- persisting the result here so the Skills screen (a few steps later in
-- the same intake flow) can read it instead of receiving it inline.
--
-- Same access-boundary reasoning as cv_path/cv_original_filename
-- (20260901000009): this is CV-derived data, so it stays out of the
-- general profiles SELECT grant and is readable only via
-- get_my_cv_info(), extended below to return it. It is written only by
-- set_cv_suggested_skills(), which trusts the caller's own auth.uid() the
-- same way confirm_cv_upload does — there is no parameter naming a
-- different profile.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists cv_suggested_skill_ids smallint[];

-- ─── confirm_cv_upload: clear stale suggestions on a new upload ───────
-- Replaces 20260901000003's function, same signature. A fresh CV
-- invalidates whatever the previous one suggested; the after() callback
-- in mediaActions.ts repopulates this once it has parsed the new file.
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
     set cv_path                 = p_blob_key,
         cv_uploaded_at          = now(),
         cv_original_filename    = v_name,
         cv_parse_consent        = coalesce(p_consent, false),
         cv_parse_consent_at     = case when p_consent then now() else null end,
         cv_suggested_skill_ids  = null
   where id = v_caller;
  perform set_config('foundry.media_write', 'false', true);
end;
$$;

revoke execute on function public.confirm_cv_upload(text, text, boolean) from public, anon;
grant  execute on function public.confirm_cv_upload(text, text, boolean) to authenticated;

-- ─── remove_my_cv: drop suggestions along with everything else ────────
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
     set cv_path                 = null,
         cv_uploaded_at          = null,
         cv_original_filename    = null,
         cv_parse_consent        = false,
         cv_parse_consent_at     = null,
         cv_suggested_skill_ids  = null
   where id = v_caller;
  perform set_config('foundry.media_write', 'false', true);
end;
$$;

revoke execute on function public.remove_my_cv() from public, anon;
grant  execute on function public.remove_my_cv() to authenticated;

-- ─── set_cv_suggested_skills ───────────────────────────────────────────
-- Called from mediaActions.ts's after() callback, using the same
-- request-scoped, cookie-bound client confirmCvUpload authenticated with
-- — so auth.uid() below is still the member who owns the upload, not a
-- service role. No parameter names a different profile.
create or replace function public.set_cv_suggested_skills(p_skill_ids smallint[])
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

  update public.profiles
     set cv_suggested_skill_ids = p_skill_ids
   where id = v_caller;
end;
$$;

revoke execute on function public.set_cv_suggested_skills(smallint[]) from public, anon;
grant  execute on function public.set_cv_suggested_skills(smallint[]) to authenticated;

-- ─── get_my_cv_info: also return the suggestions ──────────────────────
-- New output column means CREATE OR REPLACE can't be used (Postgres
-- forbids changing a function's return type in place) — drop first.
drop function if exists public.get_my_cv_info();

create function public.get_my_cv_info()
returns table (
  cv_path                 text,
  cv_original_filename    text,
  cv_uploaded_at          timestamptz,
  cv_parse_consent        boolean,
  cv_suggested_skill_ids  smallint[]
)
language sql
stable
security definer
set search_path = public
as $$
  select cv_path, cv_original_filename, cv_uploaded_at, cv_parse_consent, cv_suggested_skill_ids
    from public.profiles
   where id = auth.uid();
$$;

revoke execute on function public.get_my_cv_info() from public, anon;
grant  execute on function public.get_my_cv_info() to authenticated;

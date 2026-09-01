-- ════════════════════════════════════════════════════════════════════
-- Foundry · issue_upload_ticket accepts profile_picture and cv
--
-- upload_tickets.purpose has allowed these two values since
-- 20260829000001 ("reserved for the features that will reuse this
-- gateway"). This is that reuse. Two things change from the
-- post_image-only body (20260830000001):
--
--   1. posting_enabled() — the community kill switch — must NOT be able
--      to block a CV or avatar upload. Scoped to post_image only.
--   2. The blob key extension. post_image and profile_picture both
--      resolve to '.webp' (the gateway always re-encodes images to
--      WebP, regardless of what was uploaded). A CV cannot get the same
--      treatment — its real format (PDF or DOCX) isn't known until the
--      gateway sniffs the bytes, which happens strictly after this
--      ticket is issued. Rather than widen the key format to depend on
--      a client-supplied file type (exactly the kind of client-trusted
--      input this whole ticket system exists to avoid), a CV blob key
--      always ends '.cv' — a made-up, meaningless suffix used only so
--      the gateway's key-pattern regex has something fixed to check.
--      The REAL format drives Content-Type at write time (from sniffed
--      magic bytes) and the filename a browser saves under comes from
--      cv_original_filename via Content-Disposition, neither of which
--      depends on the storage key's extension at all.
--
-- Same signature (one arg, unchanged default), so this is a plain
-- CREATE OR REPLACE — no drop needed.
-- ════════════════════════════════════════════════════════════════════

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
    raise exception 'Only approved members can upload' using errcode = '42501';
  end if;
  if p_purpose not in ('post_image', 'profile_picture', 'cv') then
    raise exception 'Unsupported upload purpose: %', p_purpose using errcode = '22023';
  end if;
  -- The community kill switch governs post images only. A CV or avatar
  -- upload has nothing to do with whether the feed is currently open.
  if p_purpose = 'post_image' and not public.posting_enabled() then
    raise exception 'Community posting is currently disabled' using errcode = '42501';
  end if;

  -- Outstanding, not issued-per-hour — see 20260830000001. Kept as one
  -- shared ceiling across all three purposes: a member holds at most one
  -- unconsumed avatar ticket and one CV ticket at a time in the normal
  -- flow, so this cannot be approached by the new purposes alone.
  select count(*) into v_open
    from public.upload_tickets t
   where t.user_id = v_caller
     and t.consumed_at is null;
  if v_open >= 60 then
    raise exception 'Too many uploads in progress. Finish or discard one first.'
      using errcode = '42501';
  end if;

  v_key := gen_random_uuid()::text || case p_purpose
    when 'cv' then '.cv'
    else '.webp'
  end;

  insert into public.upload_tickets (blob_key, user_id, purpose)
  values (v_key, v_caller, p_purpose);

  return v_key;
end;
$$;

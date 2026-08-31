-- ════════════════════════════════════════════════════════════════════
-- Foundry · Community posts — post-deploy verification
--
-- READ-ONLY. Safe to run against production, as many times as you like.
-- It writes nothing, locks nothing, and touches no member data.
--
-- Paste the whole file into the Supabase SQL editor after `db push` and
-- after seeding app_config. It prints one row per invariant with PASS or
-- FAIL, ordered so failures sort to the top.
--
-- The point of this file is that "the migration applied without error" and
-- "the thing the migration was for is actually true" are different claims.
-- A grant that silently came back, a cron job that did not register, a kill
-- switch defaulting open — none of those raise on apply, and all of them
-- are the sort of thing you would rather find here than in an incident.
-- ════════════════════════════════════════════════════════════════════

with checks as (

-- ─── Tables and RLS ─────────────────────────────────────────────────
select
  '01 tables exist'                                  as check_name,
  count(*)                                           as got,
  '6'                                                as want,
  count(*) = 6                                       as passed
from pg_tables
where schemaname = 'public'
  and tablename in ('posts','post_images','upload_tickets',
                    'blob_deletion_queue','post_reports','post_moderation_log')

union all
select
  '02 RLS enabled on all six',
  count(*), '6',
  count(*) = 6
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('posts','post_images','upload_tickets',
                    'blob_deletion_queue','post_reports','post_moderation_log')
  and c.relrowsecurity

-- ─── The audit-trail hole 20260830000001 closed ─────────────────────
-- If this fails, an admin can delete a post through PostgREST with no
-- moderation record, no admin_actions row and no notice to the author.
union all
select
  '03 posts_delete_admin policy is GONE (audit trail)',
  count(*), '0',
  count(*) = 0
from pg_policies
where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_delete_admin'

union all
select
  '04 posts has exactly select + delete-own policies',
  count(*), '2',
  count(*) = 2
from pg_policies where schemaname = 'public' and tablename = 'posts'

-- ─── The four deny-all tables ───────────────────────────────────────
-- No policies at all is what makes these service-role only. A single
-- policy appearing here opens the table to `authenticated`.
union all
select
  '05 deny-all tables carry zero policies',
  count(*), '0',
  count(*) = 0
from pg_policies
where schemaname = 'public'
  and tablename in ('upload_tickets','blob_deletion_queue','post_reports','post_moderation_log')

-- ─── Grants ─────────────────────────────────────────────────────────
-- `revoke ... from public` is a no-op on this project (20260608000001):
-- Supabase's default privileges hand anon a direct grant. So the only
-- meaningful assertion is on the resulting ACL.
union all
select
  '06 anon can execute NO community function',
  count(*), '0',
  count(*) = 0
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_post','delete_my_post','report_post','issue_upload_ticket',
                    'posting_enabled','list_community_feed','list_my_posts','toggle_post_like',
                    'admin_delete_post','admin_resolve_post_report','admin_list_post_reports',
                    'purge_expired_posts','purge_stale_upload_tickets','purge_moderation_records',
                    'claim_blob_deletion_batch','cron_drain_blob_deletions','create_system_post',
                    'tg_enqueue_blob_deletion','tg_purge_posts_on_ban')
  and has_function_privilege('anon', p.oid, 'EXECUTE')

union all
select
  '07 internal + cron functions closed to authenticated',
  count(*), '0',
  count(*) = 0
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('purge_expired_posts','purge_stale_upload_tickets','purge_moderation_records',
                    'claim_blob_deletion_batch','cron_drain_blob_deletions','create_system_post',
                    'tg_enqueue_blob_deletion','tg_purge_posts_on_ban')
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')

union all
select
  '08 member-facing RPCs ARE callable by authenticated',
  count(*), '8',
  count(*) = 8
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_post','delete_my_post','report_post','issue_upload_ticket',
                    'posting_enabled','list_community_feed','list_my_posts','toggle_post_like')
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')

-- ─── Triggers ───────────────────────────────────────────────────────
-- This one trigger is the entire erasure guarantee: it is what makes
-- self-delete, takedown, expiry, ban and account deletion all schedule
-- their bytes for destruction.
union all
select
  '09 blob-deletion trigger on post_images',
  count(*), '1',
  count(*) = 1
from pg_trigger
where tgname = 'post_images_enqueue_blob_deletion' and not tgisinternal

union all
select
  '10 ban cascade trigger on profiles',
  count(*), '1',
  count(*) = 1
from pg_trigger
where tgname = 'profiles_purge_posts_on_ban' and not tgisinternal

union all
select
  '11 system-post triggers on all three listing tables',
  count(*), '6',
  count(*) = 6
from pg_trigger
where tgname in ('opportunities_system_post','events_system_post','vcs_grants_system_post',
                 'opportunities_delete_system_post','events_delete_system_post',
                 'vcs_grants_delete_system_post')
  and not tgisinternal

-- ─── Indexes that the design depends on ─────────────────────────────
union all
select
  '12 keyset + purge + dedupe indexes present',
  count(*), '4',
  count(*) = 4
from pg_indexes
where schemaname = 'public'
  and indexname in ('posts_feed_idx','posts_author_feed_idx',
                    'posts_expires_at_idx','posts_system_source_idx')

-- ─── Scheduled jobs ─────────────────────────────────────────────────
union all
select
  '13 all four cron jobs registered and active',
  count(*), '4',
  count(*) = 4
from cron.job
where active
  and jobname in ('purge-expired-posts-hourly','purge-upload-tickets-hourly',
                  'purge-moderation-records-daily','drain-blob-deletions')

-- ─── Configuration ──────────────────────────────────────────────────
union all
select
  '14 app_config carries the drain URL',
  count(*), '1',
  count(*) = 1
from public.app_config
where key = 'drain_blob_deletions_url' and value like 'https://%'

union all
select
  '15 cron_secret exists (reused from the email drain)',
  count(*), '1',
  count(*) = 1
from public.app_config where key = 'cron_secret' and length(value) > 0

union all
select
  '16 kill switch row exists and is a valid value',
  count(*), '1',
  count(*) = 1
from public.app_config
where key = 'community_posts_enabled' and value in ('true','false')

-- ─── Retention windows actually stored as data ──────────────────────
union all
select
  '17 posts default to a 7-day life',
  count(*), '1',
  count(*) = 1
from information_schema.columns
where table_schema = 'public' and table_name = 'posts' and column_name = 'expires_at'
  and column_default like '%7 days%'

union all
select
  '18 moderation records default to 12 months',
  count(*), '2',
  count(*) = 2
from information_schema.columns
where table_schema = 'public' and column_name = 'purge_after'
  and table_name in ('post_moderation_log','post_reports')
  -- Postgres normalises `interval '12 months'` to '1 year' in the stored
  -- default, so match what it actually writes rather than what we typed.
  and column_default like '%1 year%'

-- ─── The FK choices that make erasure and audit both work ───────────
union all
select
  '19 posts.author_id CASCADEs from auth.users',
  count(*), '1',
  count(*) = 1
from pg_constraint
where conrelid = 'public.posts'::regclass and contype = 'f' and confdeltype = 'c'
  and conkey = array[(select attnum from pg_attribute
                       where attrelid = 'public.posts'::regclass and attname = 'author_id')]

-- The moderation log must NOT have FKs, or a member deleting their account
-- destroys the record of their own moderation. Art. 17(3)(e) is the basis
-- for keeping it; a cascade would quietly override that decision.
union all
select
  '20 post_moderation_log has NO foreign keys (survives erasure)',
  count(*), '0',
  count(*) = 0
from pg_constraint
where conrelid = 'public.post_moderation_log'::regclass and contype = 'f'

-- ─── Likes (20260831000001) ──────────────────────────────────────────
-- Added after the checks above; same shape, same reasoning — deny-all
-- RLS reached only through toggle_post_like, never directly.
union all
select
  '21 post_likes table exists and carries RLS',
  count(*), '1',
  count(*) = 1
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'post_likes' and c.relrowsecurity

union all
select
  '22 post_likes carries zero policies (deny-all)',
  count(*), '0',
  count(*) = 0
from pg_policies
where schemaname = 'public' and tablename = 'post_likes'

union all
select
  '23 post_likes.post_id CASCADEs from posts, user_id CASCADEs from auth.users',
  count(*), '2',
  count(*) = 2
from pg_constraint
where conrelid = 'public.post_likes'::regclass and contype = 'f' and confdeltype = 'c'

)
select
  case when passed then 'PASS' else '*** FAIL ***' end as result,
  check_name,
  got::text as actual,
  want      as expected
from checks
order by passed, check_name;

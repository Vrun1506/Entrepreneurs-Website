-- ════════════════════════════════════════════════════════════════════
-- Foundry · Pre-Azure-deploy audit — post-deploy verification
--
-- READ-ONLY. Safe to run against production, as many times as you like.
-- It writes nothing, locks nothing, and touches no member data.
--
-- Covers three migrations from the 2026-08-30 audit:
--   20260830000003  limit 1000 on the two admin review queues
--   20260830000004  limit 1000 on the two approved-listing feeds
--   20260830000005  revoke anon EXECUTE on the 22 pre-community-posts
--                    member RPCs (update_profile, submit_opportunity, …)
--
-- Paste the whole file into the Supabase SQL editor after applying the
-- three migrations above (via `supabase db push` or by hand). It prints
-- one row per invariant with PASS or FAIL, ordered so failures sort to
-- the top. "The migration applied without error" and "the thing it was
-- for is actually true" are different claims — a grant that silently
-- came back or a limit clause that got dropped in a later edit doesn't
-- raise on apply, and is the sort of thing you'd rather find here than
-- from Sentry.
-- ════════════════════════════════════════════════════════════════════

with checks as (

-- ─── 20260830000003 / 20260830000004: row caps ──────────────────────
-- pg_get_functiondef returns the full CREATE OR REPLACE FUNCTION text,
-- so this is checking the actual live body, not just that a migration
-- ran — a hand edit in the SQL editor that dropped the limit clause
-- again would be caught here too.
select
  '01 list_pending_opportunities_admin has limit 1000' as check_name,
  case when pg_get_functiondef('public.list_pending_opportunities_admin()'::regprocedure)
       ilike '%limit 1000%' then 'yes' else 'no' end   as got,
  'yes'                                                 as want,
  pg_get_functiondef('public.list_pending_opportunities_admin()'::regprocedure)
    ilike '%limit 1000%'                                as passed

union all
select
  '02 list_pending_events_admin has limit 1000',
  case when pg_get_functiondef('public.list_pending_events_admin()'::regprocedure)
       ilike '%limit 1000%' then 'yes' else 'no' end,
  'yes',
  pg_get_functiondef('public.list_pending_events_admin()'::regprocedure)
    ilike '%limit 1000%'

union all
select
  '03 list_approved_opportunities has limit 1000',
  case when pg_get_functiondef('public.list_approved_opportunities()'::regprocedure)
       ilike '%limit 1000%' then 'yes' else 'no' end,
  'yes',
  pg_get_functiondef('public.list_approved_opportunities()'::regprocedure)
    ilike '%limit 1000%'

union all
select
  '04 list_approved_events has limit 1000',
  case when pg_get_functiondef('public.list_approved_events()'::regprocedure)
       ilike '%limit 1000%' then 'yes' else 'no' end,
  'yes',
  pg_get_functiondef('public.list_approved_events()'::regprocedure)
    ilike '%limit 1000%'

-- ─── 20260830000005: anon locked out, authenticated untouched ───────
-- Same pair-of-assertions shape as rls_smoke.sql sections 27/28 and 32:
-- one direction alone would pass on either "nothing was revoked" or "the
-- revoke also took authenticated with it and every submission form is
-- now broken" — checking both directions is what makes this trustworthy.
union all
select
  '05 all 22 member RPCs: anon EXECUTE revoked',
  count(*)::text, '0',
  count(*) = 0
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in (
    'delete_my_account', 'get_event_for_edit', 'get_my_activity',
    'get_my_listing_actions', 'get_my_listing_stats', 'get_opportunity_for_edit',
    'list_approved_events', 'list_approved_opportunities',
    'list_directory_cards', 'list_directory_facets',
    'list_my_bookmarked_opportunities', 'mark_listing_action',
    'record_listing_event', 'submit_event', 'submit_onboarding',
    'submit_opportunity', 'submit_vc_grant', 'unmark_listing_action',
    'update_event', 'update_opportunity', 'update_profile', 'update_vc_grant'
  )
  and has_function_privilege('anon', p.oid, 'EXECUTE')

union all
select
  '06 all 22 member RPCs: authenticated EXECUTE intact',
  count(*)::text, '22',
  count(*) = 22
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in (
    'delete_my_account', 'get_event_for_edit', 'get_my_activity',
    'get_my_listing_actions', 'get_my_listing_stats', 'get_opportunity_for_edit',
    'list_approved_events', 'list_approved_opportunities',
    'list_directory_cards', 'list_directory_facets',
    'list_my_bookmarked_opportunities', 'mark_listing_action',
    'record_listing_event', 'submit_event', 'submit_onboarding',
    'submit_opportunity', 'submit_vc_grant', 'unmark_listing_action',
    'update_event', 'update_opportunity', 'update_profile', 'update_vc_grant'
  )
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')

-- is_admin/is_approved are the deliberate exception — RLS policies call
-- them, so anon genuinely needs EXECUTE. Confirms the revoke migration
-- didn't accidentally sweep these two in (which would break every page
-- an anonymous visitor can reach, including the login screen's own
-- session check).
union all
select
  '07 is_admin / is_approved: still anon-executable (on purpose)',
  count(*)::text, '2',
  count(*) = 2
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('is_admin', 'is_approved')
  and has_function_privilege('anon', p.oid, 'EXECUTE')

)
select
  case when passed then 'PASS' else '*** FAIL ***' end as result,
  check_name,
  got as actual,
  want as expected
from checks
order by passed, check_name;

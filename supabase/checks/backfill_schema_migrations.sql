-- ════════════════════════════════════════════════════════════════════
-- Foundry · One-time: create and backfill supabase_migrations.schema_migrations
--
-- This project's migrations have always been applied by hand through the
-- SQL editor, so the CLI's own bookkeeping table has never existed here.
-- community_posts_all_migrations.sql assumes it exists (so `supabase db
-- push` stays consistent after today). Run this once, first, to create
-- it and record every migration that is already live in prod as applied.
--
-- Safe to run more than once — every insert is `on conflict do nothing`.
-- Run this BEFORE community_posts_all_migrations.sql.
-- ════════════════════════════════════════════════════════════════════

create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);

create table if not exists supabase_migrations.seed_files (
  path text not null primary key,
  hash text not null
);

insert into supabase_migrations.schema_migrations (version, name)
values
  ('20260527000001', 'initial_schema'),
  ('20260527000002', 'rls_policies'),
  ('20260527000003', 'admin_functions'),
  ('20260527000004', 'seed_data'),
  ('20260527000005', 'oauth_provider_role'),
  ('20260527000006', 'restrict_azure_to_imperial'),
  ('20260527000007', 'relax_grad_year_for_onboarding'),
  ('20260527000008', 'parse_oauth_full_name'),
  ('20260527000009', 'onboarding_support'),
  ('20260528000010', 'github_url'),
  ('20260528000011', 'delete_my_account'),
  ('20260528000012', 'name_min_length'),
  ('20260528000013', 'listing_status_expired'),
  ('20260528000014', 'opportunities_expansion'),
  ('20260528000015', 'events'),
  ('20260528000016', 'listings_rpcs'),
  ('20260528000017', 'opportunities_expire_cron'),
  ('20260528000018', 'admin_signup_emails'),
  ('20260529000001', 'email_domain_full_lifecycle'),
  ('20260529000002', 'relax_name_min_length'),
  ('20260529000003', 'onboarding_expansion'),
  ('20260529000004', 'delete_my_account_full_cleanup'),
  ('20260529000005', 'expire_events_and_vcs_grants'),
  ('20260529000006', 'listing_reject_returns_poster'),
  ('20260529000007', 'admin_delete_user_rpcs'),
  ('20260529000008', 'user_can_delete_own_rejected_listings'),
  ('20260529000009', 'user_update_opportunity_rpc'),
  ('20260530000001', 'user_can_delete_own_listings_any_status'),
  ('20260530000002', 'protect_contact_email'),
  ('20260530000003', 'outbound_email_queue'),
  ('20260530000004', 'approve_user_returns_email'),
  ('20260530000005', 'opportunity_bookmarks'),
  ('20260530000006', 'listing_analytics'),
  ('20260531000001', 'reject_user_full_delete'),
  ('20260531000002', 'listing_events_orphan_cleanup'),
  ('20260531000003', 'lock_status_to_role'),
  ('20260531000004', 'revoke_enqueue_outbound_email'),
  ('20260531000005', 'user_listing_actions'),
  ('20260601000000', 'fix_onboarding_status_guc'),
  ('20260602000001', 'listing_stats_distinct_clicks'),
  ('20260602000002', 'purge_rejected_listings'),
  ('20260602000003', 'validate_profile_name_chars'),
  ('20260602000004', 'cap_url_lengths'),
  ('20260603000001', 'role_lock_and_grad_year_bounds'),
  ('20260603000002', 'event_society_flag'),
  ('20260608000001', 'lock_internal_function_grants'),
  ('20260608000002', 'capture_and_lock_rls_auto_enable'),
  ('20260610000000', 'admin_create_require_profile'),
  ('20260826000001', 'user_update_event_and_vc_rpcs'),
  ('20260826000002', 'directory_card_rpc'),
  ('20260826000003', 'directory_pagination'),
  ('20260826000004', 'admin_profile_pagination'),
  ('20260827000001', 'revoke_anon_admin_rpcs'),
  ('20260827000002', 'index_cascade_fks'),
  ('20260827000003', 'bound_listing_events'),
  ('20260827000004', 'email_change_log'),
  ('20260828000001', 'user_role_add_values'),
  ('20260828000002', 'six_roles_constraints_and_rpcs'),
  ('20260828000003', 'profile_intake_columns'),
  ('20260828000004', 'self_service_affiliation'),
  ('20260828000005', 'submit_onboarding_guc_reset')
on conflict (version) do nothing;

-- Sanity check: expect exactly 56 rows.
select count(*) as backfilled_migrations from supabase_migrations.schema_migrations;

-- ════════════════════════════════════════════════════════════════════
-- Foundry · Index opportunity_skills / opportunity_sectors on opportunity_id
--
-- The sibling of the gap 20260902000001 just closed for post_likes /
-- post_reports. 20260827000002 indexed the FK-side columns that existed at
-- the time (profile_skills.profile_id, profile_sectors.profile_id — see
-- 20260826000003's header for that history) but the equivalent columns on
-- the opportunity-side junction tables were never swept:
-- opportunity_skills.opportunity_id and opportunity_sectors.opportunity_id
-- are both `on delete cascade` (20260528000014_opportunities_expansion.sql)
-- with no index — every account/opportunity deletion cascades through an
-- unindexed sequential scan of both tables, and the same unindexed columns
-- back correlated subqueries in list_pending_opportunities_admin,
-- list_approved_opportunities (x2), and list_my_bookmarked_opportunities.
--
-- Same LOCKING note as 20260902000001: plain `create index` (no
-- CONCURRENTLY — the CLI runs each migration in a transaction) takes a
-- brief ACCESS EXCLUSIVE lock, negligible at this table's current size.
-- ════════════════════════════════════════════════════════════════════

create index if not exists opportunity_skills_opportunity_idx
  on public.opportunity_skills (opportunity_id);

create index if not exists opportunity_sectors_opportunity_idx
  on public.opportunity_sectors (opportunity_id);

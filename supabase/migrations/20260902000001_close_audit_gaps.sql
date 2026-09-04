-- ════════════════════════════════════════════════════════════════════
-- Foundry · Close two gaps surfaced by a full migration audit
--
-- Two independent, additive fixes, bundled because both are "finish
-- what an earlier migration deferred" rather than new behaviour:
--
--   1. Missing FK indexes. 20260827000002 indexed the FKs that existed
--      at the time; post_likes and post_reports were added a few days
--      later (20260831000001, 20260829000001) and were never swept.
--      post_likes.user_id is ON DELETE CASCADE, so every user deletion
--      currently runs an unindexed sequential scan of post_likes to find
--      rows to cascade — the exact pattern 20260827000002's own header
--      comment describes. post_reports.reporter_id/resolved_by are
--      ON DELETE SET NULL, same underlying issue, lower frequency.
--      Same LOCKING note applies: plain `create index` (no CONCURRENTLY,
--      the CLI runs each migration in a transaction) takes a brief
--      ACCESS EXCLUSIVE lock — negligible at this table's current size.
--
--   2. Five CHECK constraints were added NOT VALID with a documented
--      "run this once you've confirmed no row violates it" follow-up
--      that was never run: profiles_linkedin_url_len,
--      profiles_github_url_len, profiles_portfolio_url_len
--      (20260602000004), and profiles_course_required_post_onboarding,
--      profiles_grad_year_role_consistency (20260529000003,
--      20260828000002). New writes were already bounded either way —
--      NOT VALID only skips existing rows, not future ones — so this
--      just finishes the job. VALIDATE CONSTRAINT is a read-only scan
--      (no table rewrite, no ACCESS EXCLUSIVE lock — SHARE UPDATE
--      EXCLUSIVE, which still allows reads and writes to proceed); if
--      any row fails, it errors out and leaves the constraint exactly
--      as NOT VALID as it was, rather than corrupting anything.
-- ════════════════════════════════════════════════════════════════════

-- ─── Missing FK indexes ────────────────────────────────────────────
create index if not exists post_likes_user_idx
  on public.post_likes (user_id);

create index if not exists post_reports_reporter_idx
  on public.post_reports (reporter_id);

create index if not exists post_reports_resolved_by_idx
  on public.post_reports (resolved_by);

-- ─── Validate the deferred CHECK constraints ───────────────────────
alter table public.profiles validate constraint profiles_linkedin_url_len;
alter table public.profiles validate constraint profiles_github_url_len;
alter table public.profiles validate constraint profiles_portfolio_url_len;
alter table public.profiles validate constraint profiles_course_required_post_onboarding;
alter table public.profiles validate constraint profiles_grad_year_role_consistency;

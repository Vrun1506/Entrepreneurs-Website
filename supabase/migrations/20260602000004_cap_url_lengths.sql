-- ════════════════════════════════════════════════════════════════════
-- Foundry · Cap URL field lengths
--
-- Every URL column is validated for *format* (`~* '^https?://...'`) but the
-- regex is anchored only at the start, so a value like
--   https://linkedin.com/<5 MB of junk>
-- passes the format check. The submission forms cap URLs via Zod, but:
--   • profile URLs (linkedin/github/portfolio) skip Zod entirely — the
--     browser calls update_profile / submit_onboarding directly — so the
--     only server-side gate is this table.
--   • a hand-crafted RPC call can bypass the listings Zod layer too.
-- Without a length bound an authenticated user can store arbitrarily large
-- text, bloating storage and degrading the /community and listings pages.
--
-- 512 chars is a quarter of the legacy 2048 URL convention and still far
-- larger than any real value here (a LinkedIn/GitHub/portfolio/Luma/VC URL
-- is almost never over ~120 chars; even job-portal apply links with tracking
-- params rarely pass ~300). Bump later if a legitimate longer one shows up —
-- it's additive.
--
-- NOT VALID: existing rows came through the old 2048 Zod ceiling and are
-- almost certainly well under 512, but we don't re-check them so this
-- migration can never fail on prod data. Every FUTURE write is bounded,
-- which is the abuse vector. To retro-validate once you've confirmed no row
-- exceeds 512, run (per constraint):
--   alter table public.profiles validate constraint profiles_linkedin_url_len;
--
-- Pure ALTER TABLE ADD CONSTRAINT — no functions/RPCs touched.
-- ════════════════════════════════════════════════════════════════════

-- ─── profiles ────────────────────────────────────────────────────────
alter table public.profiles
  drop constraint if exists profiles_linkedin_url_len;
alter table public.profiles
  add constraint profiles_linkedin_url_len
  check (linkedin_url is null or length(linkedin_url) <= 512) not valid;

alter table public.profiles
  drop constraint if exists profiles_github_url_len;
alter table public.profiles
  add constraint profiles_github_url_len
  check (github_url is null or length(github_url) <= 512) not valid;

alter table public.profiles
  drop constraint if exists profiles_portfolio_url_len;
alter table public.profiles
  add constraint profiles_portfolio_url_len
  check (portfolio_url is null or length(portfolio_url) <= 512) not valid;

-- ─── opportunities ───────────────────────────────────────────────────
alter table public.opportunities
  drop constraint if exists opportunities_apply_url_len;
alter table public.opportunities
  add constraint opportunities_apply_url_len
  check (apply_url is null or length(apply_url) <= 512) not valid;

-- ─── events ──────────────────────────────────────────────────────────
alter table public.events
  drop constraint if exists events_luma_link_len;
alter table public.events
  add constraint events_luma_link_len
  check (length(luma_link) <= 512) not valid;

-- ─── vcs_grants ──────────────────────────────────────────────────────
alter table public.vcs_grants
  drop constraint if exists vcs_grants_link_len;
alter table public.vcs_grants
  add constraint vcs_grants_link_len
  check (length(link) <= 512) not valid;

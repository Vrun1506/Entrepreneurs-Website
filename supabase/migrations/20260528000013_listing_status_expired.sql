-- ════════════════════════════════════════════════════════════════════
-- Foundry · Add 'expired' to listing_status enum
--
-- Standalone migration because Postgres requires ALTER TYPE … ADD VALUE
-- to be committed BEFORE the new value can be referenced (e.g. by a
-- CHECK constraint in a later migration).
-- ════════════════════════════════════════════════════════════════════

alter type public.listing_status add value if not exists 'expired';

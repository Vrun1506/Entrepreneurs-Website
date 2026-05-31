-- ════════════════════════════════════════════════════════════════════
-- Foundry · Seed data
--
-- Skills and sectors come from the existing lists in frontend Community.tsx.
-- Idempotent: safe to re-run; conflicts on name do nothing.
-- ════════════════════════════════════════════════════════════════════

insert into public.skills (name) values
  ('Machine learning'),
  ('Full-stack dev'),
  ('Bioengineering'),
  ('Product'),
  ('Hardware'),
  ('Finance / VC'),
  ('Design'),
  ('Sales / GTM'),
  ('Regulatory'),
  ('Clinical research'),
  ('Deep tech'),
  ('Climate / Energy')
on conflict (name) do nothing;

insert into public.sectors (name) values
  ('Biotech / Health'),
  ('Climate / Energy'),
  ('AI / ML'),
  ('Deeptech'),
  ('Fintech'),
  ('Consumer'),
  ('Defence')
on conflict (name) do nothing;

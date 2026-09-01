-- ════════════════════════════════════════════════════════════════════
-- Foundry · Closed skills taxonomy for the rebuilt intake
--
-- The 12 skills seeded in 20260527000004 cannot describe a cohort
-- spanning bioengineering, computing, physics, medicine and business —
-- and free-text entry was explicitly rejected (it produces "ML",
-- "machine learning" and "AI/ML" as three unrelated strings and rots
-- /members filtering). This migration keeps the list CLOSED and
-- growable only by migration, while making it wide enough to be
-- useful: ~160 entries across 8 categories, each with an alias list so
-- a CV that says "PyTorch" or "GCP" still matches "Machine learning" /
-- "Cloud engineering".
--
-- RULE: no canonical name shorter than 3 characters. A skill literally
-- named "R" would match inside almost any word once the CV matcher
-- does substring search. "R (statistics)" carries the aliases instead.
--
-- The 12 legacy names are UPDATEd in place (same id, so any existing
-- profile_skills rows are untouched) rather than replaced, then the
-- rest are INSERTed. Both halves are idempotent — safe to re-run.
--
-- category is display-only, for grouping the picker. Filtering and
-- matching stay on skill id, never on category text.
-- ════════════════════════════════════════════════════════════════════

alter table public.skills
  add column if not exists category text,
  add column if not exists aliases  text[] not null default '{}';

-- The 3-character rule above is stated as a content rule but was never a
-- constraint the schema enforced — the matcher's own word-boundary regex
-- (lib/cv/matchSkills.ts) already prevents the substring bug regardless of
-- name length, but that only holds as long as every future `insert into
-- skills` (this taxonomy's own stated growth path — "one insert in a new
-- migration") remembers the rule by convention. Make it structural instead.
alter table public.skills
  add constraint skills_name_min_length check (length(name) >= 3);

-- ─── Legacy 12: categorised and given aliases in place ────────────────
update public.skills set category = 'Data, AI & Maths', aliases = ARRAY['ml','sklearn','scikit-learn','artificial intelligence']
  where name = 'Machine learning';
update public.skills set category = 'Engineering & Software', aliases = ARRAY['fullstack','full stack','full-stack development','full-stack developer']
  where name = 'Full-stack dev';
update public.skills set category = 'Life Sciences & Medicine', aliases = ARRAY['biomedical engineering','bioeng','tissue engineering']
  where name = 'Bioengineering';
update public.skills set category = 'Design & Product', aliases = ARRAY['product management','product manager','roadmapping']
  where name = 'Product';
update public.skills set category = 'Physical Sciences & Hardware', aliases = ARRAY['hardware engineering','electronics','embedded hardware']
  where name = 'Hardware';
update public.skills set category = 'Business, Finance & Legal', aliases = ARRAY['finance','venture capital','vc','investing']
  where name = 'Finance / VC';
update public.skills set category = 'Design & Product', aliases = ARRAY['ux design','ui design','visual design','graphic design']
  where name = 'Design';
update public.skills set category = 'Go-to-market & Operations', aliases = ARRAY['sales','go-to-market','gtm','b2b sales']
  where name = 'Sales / GTM';
update public.skills set category = 'Life Sciences & Medicine', aliases = ARRAY['regulatory affairs','fda','mhra','regulatory strategy']
  where name = 'Regulatory';
update public.skills set category = 'Life Sciences & Medicine', aliases = ARRAY['clinical trials','gcp']
  where name = 'Clinical research';
update public.skills set category = 'Physical Sciences & Hardware', aliases = ARRAY['deeptech','hard tech']
  where name = 'Deep tech';
update public.skills set category = 'Physical Sciences & Hardware', aliases = ARRAY['climate tech','clean energy','renewable energy']
  where name = 'Climate / Energy';

-- ─── Engineering & Software ────────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Backend development', 'Engineering & Software', ARRAY['backend','back-end','server-side']),
  ('Frontend development', 'Engineering & Software', ARRAY['frontend','front-end']),
  ('Mobile development', 'Engineering & Software', ARRAY['ios development','android development','mobile apps','swift','kotlin']),
  ('DevOps', 'Engineering & Software', ARRAY['devops','sre','site reliability','ci/cd']),
  ('Cloud engineering', 'Engineering & Software', ARRAY['aws','gcp','azure','cloud computing']),
  ('Embedded systems', 'Engineering & Software', ARRAY['embedded software','firmware','microcontrollers','rtos']),
  ('Systems programming', 'Engineering & Software', ARRAY['c++','rust','low-level programming']),
  ('Web development', 'Engineering & Software', ARRAY['web dev','javascript','typescript','react','next.js']),
  ('API design', 'Engineering & Software', ARRAY['rest api','graphql','api development']),
  ('Database engineering', 'Engineering & Software', ARRAY['sql','postgresql','database design','mysql']),
  ('Cybersecurity', 'Engineering & Software', ARRAY['infosec','security engineering','penetration testing','appsec']),
  ('Blockchain / Web3', 'Engineering & Software', ARRAY['smart contracts','solidity','crypto engineering','web3']),
  ('Quality assurance', 'Engineering & Software', ARRAY['qa','test automation','unit testing']),
  ('Game development', 'Engineering & Software', ARRAY['unity','unreal engine','game programming']),
  ('Computer vision', 'Engineering & Software', ARRAY['cv','image processing','opencv']),
  ('Natural language processing', 'Engineering & Software', ARRAY['nlp','text processing','language models']),
  ('Robotics software', 'Engineering & Software', ARRAY['ros','robot operating system','robotics programming']),
  ('Software architecture', 'Engineering & Software', ARRAY['system design','architecture design']),
  ('Open-source contribution', 'Engineering & Software', ARRAY['oss','open source']),
  ('Technical writing', 'Engineering & Software', ARRAY['documentation','developer docs']),
  ('Distributed systems', 'Engineering & Software', ARRAY['microservices','distributed computing']),
  ('Compiler design', 'Engineering & Software', ARRAY['plt','programming languages theory']),
  ('AR/VR development', 'Engineering & Software', ARRAY['augmented reality','virtual reality','xr']),
  ('Automation / scripting', 'Engineering & Software', ARRAY['automation','shell scripting','bash']),
  ('IT support', 'Engineering & Software', ARRAY['it support','helpdesk','sysadmin'])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Data, AI & Maths ──────────────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Deep learning', 'Data, AI & Maths', ARRAY['neural networks','dl','pytorch','tensorflow']),
  ('Data science', 'Data, AI & Maths', ARRAY['data analysis','data analytics']),
  ('Data engineering', 'Data, AI & Maths', ARRAY['etl','data pipelines','spark','airflow']),
  ('R (statistics)', 'Data, AI & Maths', ARRAY['r programming','rstudio','tidyverse']),
  ('Python programming', 'Data, AI & Maths', ARRAY['python','pandas','numpy']),
  ('Statistics', 'Data, AI & Maths', ARRAY['statistical analysis','biostatistics','probability']),
  ('Applied mathematics', 'Data, AI & Maths', ARRAY['maths','mathematical modelling']),
  ('Optimization', 'Data, AI & Maths', ARRAY['operations research','linear programming']),
  ('Large language models', 'Data, AI & Maths', ARRAY['llm','llms','gpt','prompt engineering']),
  ('Reinforcement learning', 'Data, AI & Maths', ARRAY['rl']),
  ('Computational biology', 'Data, AI & Maths', ARRAY['bioinformatics','computational genomics']),
  ('Quantitative finance', 'Data, AI & Maths', ARRAY['quant','quantitative research']),
  ('Data visualization', 'Data, AI & Maths', ARRAY['dataviz','tableau','power bi','dashboards']),
  ('Experimentation / A/B testing', 'Data, AI & Maths', ARRAY['ab testing','experimentation','causal inference']),
  ('Time-series analysis', 'Data, AI & Maths', ARRAY['forecasting','time series']),
  ('Simulation & modelling', 'Data, AI & Maths', ARRAY['monte carlo','simulation']),
  ('Business intelligence', 'Data, AI & Maths', ARRAY['bi','sql analytics']),
  ('MLOps', 'Data, AI & Maths', ARRAY['ml infrastructure','model deployment']),
  ('Actuarial science', 'Data, AI & Maths', ARRAY['actuarial']),
  ('Data governance', 'Data, AI & Maths', ARRAY['data quality','master data management'])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Life Sciences & Medicine ──────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Molecular biology', 'Life Sciences & Medicine', ARRAY['molecular biosciences']),
  ('Genomics', 'Life Sciences & Medicine', ARRAY['genetics','genome sequencing','crispr']),
  ('Immunology', 'Life Sciences & Medicine', ARRAY['immune system research']),
  ('Pharmacology', 'Life Sciences & Medicine', ARRAY['drug development','pharma']),
  ('Medical devices', 'Life Sciences & Medicine', ARRAY['medtech','device design']),
  ('Public health', 'Life Sciences & Medicine', ARRAY['epidemiology','global health']),
  ('Biochemistry', 'Life Sciences & Medicine', ARRAY['biochem']),
  ('Neuroscience', 'Life Sciences & Medicine', ARRAY['neurobiology','cognitive science']),
  ('Synthetic biology', 'Life Sciences & Medicine', ARRAY['synbio']),
  ('Biomanufacturing', 'Life Sciences & Medicine', ARRAY['bioprocessing','cell culture']),
  ('Clinical practice', 'Life Sciences & Medicine', ARRAY['clinical care','patient care','nursing']),
  ('Diagnostics', 'Life Sciences & Medicine', ARRAY['in vitro diagnostics','ivd']),
  ('Health data analytics', 'Life Sciences & Medicine', ARRAY['digital health','health informatics']),
  ('Toxicology', 'Life Sciences & Medicine', ARRAY[]::text[]),
  ('Structural biology', 'Life Sciences & Medicine', ARRAY['protein structure','crystallography']),
  ('Veterinary science', 'Life Sciences & Medicine', ARRAY['veterinary medicine']),
  ('Nutrition science', 'Life Sciences & Medicine', ARRAY['dietetics']),
  ('Medical writing', 'Life Sciences & Medicine', ARRAY['scientific writing']),
  ('Genetic counselling', 'Life Sciences & Medicine', ARRAY['genetic counseling']),
  ('Physiology', 'Life Sciences & Medicine', ARRAY[]::text[])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Physical Sciences & Hardware ──────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Electronics design', 'Physical Sciences & Hardware', ARRAY['pcb design','circuit design']),
  ('Mechanical engineering', 'Physical Sciences & Hardware', ARRAY['cad','mechanical design','solidworks']),
  ('Materials science', 'Physical Sciences & Hardware', ARRAY['materials engineering','nanomaterials']),
  ('Chemical engineering', 'Physical Sciences & Hardware', ARRAY['process engineering']),
  ('Applied physics', 'Physical Sciences & Hardware', ARRAY['physics']),
  ('Semiconductor design', 'Physical Sciences & Hardware', ARRAY['chip design','vlsi','asic']),
  ('Battery / energy storage', 'Physical Sciences & Hardware', ARRAY['batteries','energy storage systems']),
  ('Renewable energy', 'Physical Sciences & Hardware', ARRAY['solar','wind energy']),
  ('Aerospace engineering', 'Physical Sciences & Hardware', ARRAY['aeronautics','spacecraft design']),
  ('Civil engineering', 'Physical Sciences & Hardware', ARRAY['structural engineering','construction']),
  ('Robotics hardware', 'Physical Sciences & Hardware', ARRAY['mechatronics','actuators']),
  ('Manufacturing / prototyping', 'Physical Sciences & Hardware', ARRAY['3d printing','cnc machining','prototyping']),
  ('Quantum computing', 'Physical Sciences & Hardware', ARRAY['quantum information']),
  ('Photonics / optics', 'Physical Sciences & Hardware', ARRAY['optical engineering','lasers']),
  ('Fluid dynamics', 'Physical Sciences & Hardware', ARRAY['cfd','aerodynamics']),
  ('Nuclear engineering', 'Physical Sciences & Hardware', ARRAY[]::text[]),
  ('Metallurgy', 'Physical Sciences & Hardware', ARRAY[]::text[]),
  ('Environmental engineering', 'Physical Sciences & Hardware', ARRAY[]::text[]),
  ('Instrumentation', 'Physical Sciences & Hardware', ARRAY['sensors','measurement systems']),
  ('Systems engineering', 'Physical Sciences & Hardware', ARRAY[]::text[])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Design & Product ──────────────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('UX design', 'Design & Product', ARRAY['user experience','ux research']),
  ('UI design', 'Design & Product', ARRAY['user interface design']),
  ('Product design', 'Design & Product', ARRAY['industrial design']),
  ('Graphic design', 'Design & Product', ARRAY['branding','illustration']),
  ('User research', 'Design & Product', ARRAY['usability testing','customer research']),
  ('Design prototyping', 'Design & Product', ARRAY['figma','wireframing']),
  ('Brand strategy', 'Design & Product', ARRAY['brand identity']),
  ('Motion design', 'Design & Product', ARRAY['animation','after effects']),
  ('Design systems', 'Design & Product', ARRAY['component libraries']),
  ('Service design', 'Design & Product', ARRAY[]::text[]),
  ('Video production', 'Design & Product', ARRAY['videography','video editing']),
  ('Copywriting', 'Design & Product', ARRAY['content writing']),
  ('Photography', 'Design & Product', ARRAY[]::text[]),
  ('3D modelling / animation', 'Design & Product', ARRAY['blender','cinema 4d']),
  ('Accessibility design', 'Design & Product', ARRAY['a11y','inclusive design'])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Business, Finance & Legal ─────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Financial modelling', 'Business, Finance & Legal', ARRAY['financial analysis','valuation']),
  ('Corporate finance', 'Business, Finance & Legal', ARRAY[]::text[]),
  ('Accounting', 'Business, Finance & Legal', ARRAY['bookkeeping','financial reporting']),
  ('Fundraising', 'Business, Finance & Legal', ARRAY['pitching investors','cap table']),
  ('Legal / contracts', 'Business, Finance & Legal', ARRAY['contract law','commercial law']),
  ('Intellectual property', 'Business, Finance & Legal', ARRAY['patents','ip strategy']),
  ('Strategy consulting', 'Business, Finance & Legal', ARRAY['management consulting']),
  ('Investment banking', 'Business, Finance & Legal', ARRAY['ib','m&a']),
  ('Private equity', 'Business, Finance & Legal', ARRAY['pe']),
  ('Risk management', 'Business, Finance & Legal', ARRAY[]::text[]),
  ('Corporate governance', 'Business, Finance & Legal', ARRAY[]::text[]),
  ('Tax', 'Business, Finance & Legal', ARRAY['taxation']),
  ('Insurance', 'Business, Finance & Legal', ARRAY[]::text[]),
  ('Economics', 'Business, Finance & Legal', ARRAY['econometrics']),
  ('Business development', 'Business, Finance & Legal', ARRAY['bd','partnerships']),
  ('Negotiation', 'Business, Finance & Legal', ARRAY[]::text[]),
  ('Procurement', 'Business, Finance & Legal', ARRAY['supply chain']),
  ('HR / people ops', 'Business, Finance & Legal', ARRAY['human resources','talent']),
  ('Compliance', 'Business, Finance & Legal', ARRAY['regulatory compliance']),
  ('Corporate strategy', 'Business, Finance & Legal', ARRAY['corp dev'])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Go-to-market & Operations ─────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Sales', 'Go-to-market & Operations', ARRAY['b2b sales','saas sales']),
  ('Marketing', 'Go-to-market & Operations', ARRAY['digital marketing','growth marketing']),
  ('Growth', 'Go-to-market & Operations', ARRAY['growth hacking','user acquisition']),
  ('SEO / content marketing', 'Go-to-market & Operations', ARRAY['seo','content strategy']),
  ('Social media marketing', 'Go-to-market & Operations', ARRAY['social media']),
  ('Customer success', 'Go-to-market & Operations', ARRAY['account management']),
  ('Operations management', 'Go-to-market & Operations', ARRAY['ops']),
  ('Supply chain management', 'Go-to-market & Operations', ARRAY['logistics']),
  ('Project management', 'Go-to-market & Operations', ARRAY['pmp','agile','scrum']),
  ('Community management', 'Go-to-market & Operations', ARRAY['community building']),
  ('Public relations', 'Go-to-market & Operations', ARRAY['pr','communications']),
  ('Event management', 'Go-to-market & Operations', ARRAY['event planning']),
  ('Customer support', 'Go-to-market & Operations', ARRAY[]::text[]),
  ('E-commerce', 'Go-to-market & Operations', ARRAY['shopify','online retail']),
  ('Recruiting', 'Go-to-market & Operations', ARRAY['talent acquisition']),
  ('Localization', 'Go-to-market & Operations', ARRAY['translation']),
  ('Data privacy / GDPR', 'Go-to-market & Operations', ARRAY['privacy compliance','gdpr']),
  ('Change management', 'Go-to-market & Operations', ARRAY[]::text[]),
  ('Affiliate marketing', 'Go-to-market & Operations', ARRAY[]::text[]),
  ('Retail operations', 'Go-to-market & Operations', ARRAY['franchising']::text[])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ─── Research & Academic ───────────────────────────────────────────
insert into public.skills (name, category, aliases) values
  ('Academic research', 'Research & Academic', ARRAY[]::text[]),
  ('Grant writing', 'Research & Academic', ARRAY['research funding']),
  ('Scientific writing', 'Research & Academic', ARRAY['academic writing']),
  ('Peer review', 'Research & Academic', ARRAY[]::text[]),
  ('Teaching / lecturing', 'Research & Academic', ARRAY['teaching']),
  ('Literature review', 'Research & Academic', ARRAY[]::text[]),
  ('Experimental design', 'Research & Academic', ARRAY[]::text[]),
  ('Qualitative research', 'Research & Academic', ARRAY['ethnography','interviews']),
  ('Policy research', 'Research & Academic', ARRAY['public policy']),
  ('Science communication', 'Research & Academic', ARRAY['sci comm']),
  ('PhD supervision', 'Research & Academic', ARRAY[]::text[]),
  ('Lab management', 'Research & Academic', ARRAY[]::text[]),
  ('Technology transfer', 'Research & Academic', ARRAY['tech transfer']),
  ('Humanities research', 'Research & Academic', ARRAY['history research']),
  ('Social science research', 'Research & Academic', ARRAY[]::text[])
on conflict (name) do update set category = excluded.category, aliases = excluded.aliases;

-- ════════════════════════════════════════════════════════════════════
-- profile_skills.is_core — "starred" skills, capped at 3 per profile.
--
-- Mirrors the prototype's "star up to three as core" without any of the
-- free-entry review-queue machinery that a growable lookup would have
-- needed. Enforced in a trigger, not just the UI, because the RPC in
-- 20260901000003 is the only writer but a future direct-table caller
-- (an admin script, a fixup) must not be able to bypass it either.
-- ════════════════════════════════════════════════════════════════════

alter table public.profile_skills
  add column if not exists is_core boolean not null default false;

create or replace function public.tg_profile_skills_cap_core()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if new.is_core then
    select count(*) into v_count
      from public.profile_skills
     where profile_id = new.profile_id
       and is_core
       and skill_id <> new.skill_id;
    if v_count >= 3 then
      raise exception 'At most 3 core skills are allowed' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_skills_cap_core on public.profile_skills;
create trigger profile_skills_cap_core
  before insert or update on public.profile_skills
  for each row execute function public.tg_profile_skills_cap_core();

revoke execute on function public.tg_profile_skills_cap_core()
  from public, anon, authenticated;

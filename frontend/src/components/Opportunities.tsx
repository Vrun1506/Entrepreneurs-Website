"use client";

/* ── Data ─────────────────────────────────────────────────────────── */
const OPPORTUNITIES = [
  {
    tag: "Full-time",
    title: "ML Engineer",
    company: "Helixa Bio",
    sector: "Biotech / Health",
    pay: "£55–70k",
    equity: "0.2–0.5%",
    location: "London",
    skills: ["Machine learning", "Python"],
    posted: "2d ago",
  },
  {
    tag: "Internship",
    title: "Growth & GTM Intern",
    company: "Quantora",
    sector: "Fintech",
    pay: "£2,200/mo",
    equity: null,
    location: "Remote",
    skills: ["Sales / GTM", "Product"],
    posted: "4d ago",
  },
  {
    tag: "Grant",
    title: "Innovate UK Young Founders Fund",
    company: "Innovate UK",
    sector: "Deeptech",
    pay: "Up to £50k",
    equity: null,
    location: "UK-wide",
    skills: ["Finance / VC"],
    posted: "3d ago",
  },
] as const;

const TAG_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "Full-time":  { border: "border-gold/30",       text: "text-gold",     bg: "bg-gold/10" },
  Internship:   { border: "border-[#6aa0ff]/25",   text: "text-[#6aa0ff]", bg: "bg-[#6aa0ff]/8" },
  Hackathon:    { border: "border-[#a064ff]/25",   text: "text-[#a064ff]", bg: "bg-[#a064ff]/8" },
  Grant:        { border: "border-[#64d282]/25",   text: "text-[#64d282]", bg: "bg-[#64d282]/8" },
};

/* ── Sub-components ───────────────────────────────────────────────── */
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-8 h-px bg-gold shrink-0" />
      <span className="text-gold text-[0.75rem] font-medium tracking-[0.1em] uppercase">{text}</span>
    </div>
  );
}

function TagBadge({ tag }: { tag: string }) {
  const s = TAG_STYLES[tag] ?? TAG_STYLES["Full-time"];
  return (
    <span className={`text-[0.7rem] px-2.5 py-0.5 rounded-full border tracking-wide ${s.border} ${s.text} ${s.bg}`}>
      {tag}
    </span>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[0.7rem] text-text-muted mb-0.5">{label}</div>
      <div className="text-[0.8rem] text-text-primary font-medium">{value}</div>
    </div>
  );
}

function OpportunityCard({ tag, title, company, sector, pay, equity, location, skills, posted }: typeof OPPORTUNITIES[number]) {
  return (
    <div className="p-6 rounded-xl bg-bg-card border border-border-subtle transition-all duration-200 hover:border-border hover:-translate-y-0.5 cursor-default">
      <div className="flex justify-between items-start mb-3">
        <TagBadge tag={tag} />
        <span className="text-[0.7rem] text-text-muted">{posted}</span>
      </div>

      <h3 className="text-[0.95rem] font-medium text-text-primary leading-snug mb-1">{title}</h3>
      <p className="text-[0.8rem] text-text-muted mb-4">{company} · {sector}</p>

      <div className="flex gap-5 mb-4">
        <MetaItem label="Pay" value={pay} />
        {equity && <MetaItem label="Equity" value={equity} />}
        <MetaItem label="Location" value={location} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <span key={s} className="text-[0.7rem] px-2.5 py-0.5 rounded-full border border-border text-text-muted">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export default function Opportunities() {
  return (
    <section id="opportunities" className="py-28 px-8 max-w-[1200px] mx-auto">
      <SectionLabel text="Opportunities" />

      <div className="flex flex-wrap justify-between items-end gap-6 mb-12">
        <h2 className="font-display leading-[1.15] tracking-tight text-[clamp(1.8rem,3vw,2.6rem)]">
          Jobs, internships,
          <br />
          <em className="text-gold">and more.</em>
        </h2>

        <p className="text-[0.875rem] text-text-secondary font-light leading-[1.65] max-w-[360px]">
          Roles posted by alumni founders directly — your golden ticket to finding
          your next job via warm outreach.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {OPPORTUNITIES.map((opp) => <OpportunityCard key={opp.title} {...opp} />)}
      </div>
    </section>
  );
}
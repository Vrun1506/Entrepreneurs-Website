import { SectionHead } from "@/components/SectionHead";

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

/* ── Sub-components ───────────────────────────────────────────────── */

// Label over value, the unit a datasheet is made of. Measured quantities are
// set in the mono face; a place name is not a measurement, so it isn't.
function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label-wide mb-1 text-text-muted">{label}</div>
      <div className={`text-[0.825rem] text-text-primary ${mono ? "data" : ""}`}>{value}</div>
    </div>
  );
}

function OpportunityCell({
  tag, title, company, sector, pay, equity, location, skills, posted,
}: typeof OPPORTUNITIES[number]) {
  return (
    <article className="flex flex-col bg-bg-primary p-6 transition-colors duration-150 hover:bg-bg-card">
      {/* The listing kind used to be a coloured pill — blue for internships,
          purple for hackathons, green for grants. Four hues invented for four
          strings, in a brand with two values. It is a field like any other
          field now, and the row it sits in is the card's header rule. */}
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-border-subtle pb-3">
        <span className="label-wide text-text-primary">{tag}</span>
        <span className="data text-[0.72rem] text-text-muted">{posted}</span>
      </div>

      <h3 className="mb-1 text-[1rem] font-medium leading-snug text-text-primary">{title}</h3>
      <p className="mb-6 text-[0.8rem] text-text-muted">{company} · {sector}</p>

      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-4">
        <Meta label="Pay" value={pay} mono />
        {equity && <Meta label="Equity" value={equity} mono />}
        <Meta label="Location" value={location} />
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <span key={s} className="rounded-lg border border-border px-2.5 py-0.5 text-[0.72rem] text-text-muted">
            {s}
          </span>
        ))}
      </div>
    </article>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export default function Opportunities() {
  return (
    <section id="opportunities" className="px-8 py-24">
      <div className="mx-auto max-w-[1200px]">
      {/* Treatment 3 of 5: inverted emphasis. Both lines are the same size;
          the second recedes into the secondary ink instead of lighting up. */}
      <SectionHead
        label="Opportunities"
        aside={
          <p className="max-w-[38ch] text-[0.875rem] leading-[1.65] text-text-secondary">
            Roles posted by alumni founders directly — your golden ticket to finding
            your next job via warm outreach.
          </p>
        }
      >
        <h2 className="text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.06] tracking-[-0.035em]">
          <span className="block font-semibold text-text-primary">Jobs, internships,</span>
          <span className="block font-semibold text-text-muted">and more.</span>
        </h2>
      </SectionHead>

      <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {OPPORTUNITIES.map((opp) => <OpportunityCell key={opp.title} {...opp} />)}
      </div>
      </div>
    </section>
  );
}

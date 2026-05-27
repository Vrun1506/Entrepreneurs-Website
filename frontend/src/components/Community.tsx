"use client";

/* ── Data ─────────────────────────────────────────────────────────── */
const SKILLS = [
  "Machine learning", "Full-stack dev", "Bioengineering", "Product",
  "Hardware", "Finance / VC", "Design", "Sales / GTM",
  "Regulatory", "Clinical research", "Deep tech", "Climate / Energy",
];

const SECTORS = [
  "Biotech / Health", "Climate / Energy", "AI / ML",
  "Deeptech", "Fintech", "Consumer", "Defence",
];

const ACTIVE_SKILLS  = new Set(["Machine learning", "Bioengineering", "Hardware"]);
const ACTIVE_SECTORS = new Set(["Biotech / Health", "AI / ML"]);

const PROFILES = [
  {
    initials: "SA", name: "Sofia A.",  role: "Current student",
    bio: "Building sensor fusion for surgical robotics",
    skills: ["Hardware", "Machine learning"], looking: "Co-founder",
  },
  {
    initials: "JK", name: "James K.",  role: "Alumni founder",
    bio: "Ex-McKinsey → founded a climate fintech, raised seed",
    skills: ["Finance / VC", "Product"], looking: "Funding",
  },
  {
    initials: "ML", name: "Maria L.",  role: "Mentor",
    bio: "Director of Product @ scale-up, 10 yrs in healthtech",
    skills: ["Product", "Clinical research"], looking: "Just here to help",
  },
  {
    initials: "RP", name: "Rishi P.",  role: "Recent grad",
    bio: "Full-stack dev, building a dev tool for clinical trials",
    skills: ["Full-stack dev", "Regulatory"], looking: "Beta users",
  },
];

/* ── Shared sub-components ────────────────────────────────────────── */
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-8 h-px bg-gold shrink-0" />
      <span className="text-gold text-[0.75rem] font-medium tracking-[0.1em] uppercase">{text}</span>
    </div>
  );
}

function Chip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <span className={active ? "inline-flex items-center px-3 py-1 rounded-full text-[0.775rem] whitespace-nowrap border transition-colors duration-150 border-gold text-gold bg-gold-muted" : "inline-flex items-center px-3 py-1 rounded-full text-[0.775rem] whitespace-nowrap border transition-colors duration-150 border-border text-text-secondary"}>
      {label}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center bg-gold/15 border border-gold/30 text-gold text-[0.8rem] font-semibold">
      {initials}
    </div>
  );
}

function ProfileCard({ initials, name, role, bio, skills, looking }: typeof PROFILES[0]) {
  return (
    <div className="p-6 rounded-xl bg-bg-card border border-border-subtle transition-all duration-200 hover:border-gold/25 hover:-translate-y-0.5">
      <div className="flex items-center gap-3 mb-4">
        <Avatar initials={initials} />
        <div>
          <div className="text-[0.9rem] font-medium text-text-primary">{name}</div>
          <div className="text-[0.775rem] text-text-muted">{role}</div>
        </div>
      </div>

      <p className="text-[0.825rem] text-text-secondary leading-relaxed mb-4">{bio}</p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {skills.map((s) => <Chip key={s} label={s} />)}
      </div>

      <div className="flex items-center gap-1.5 text-[0.75rem] text-text-muted">
        <span>Looking for</span>
        <span className="px-2 py-0.5 rounded-full border border-gold/30 text-gold text-[0.725rem]">
          {looking}
        </span>
      </div>
    </div>
  );
}

/* ── Section ──────────────────────────────────────────────────────── */
export default function Community() {
  return (
    <section
      id="community"
      className="py-28 px-8 bg-bg-secondary border-y border-border-subtle"
    >
      <div className="max-w-[1200px] mx-auto">
        <SectionLabel text="Community" />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-16 items-start">
          {/* Left: copy + chip selectors */}
          <div>
            <h2 className="font-display leading-[1.15] tracking-tight mb-5 text-[clamp(1.8rem,3vw,2.6rem)]">
              Build your profile.
              <br />
              <em className="text-gold">Get found.</em>
            </h2>

            <p className="text-[0.9rem] text-text-secondary font-light leading-[1.75] mb-8">
              Your profile shows what you&apos;re building, what you&apos;re good at, and what
              you&apos;re looking for — skills, sectors, and intent. Smart matching surfaces
              the right people at the right time.
            </p>

            {/* Skills picker */}
            <div className="mb-6">
              <p className="text-[0.775rem] text-text-muted uppercase tracking-widest mb-3">
                Skills · pick up to 5
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SKILLS.map((s) => <Chip key={s} label={s} active={ACTIVE_SKILLS.has(s)} />)}
              </div>
            </div>

            {/* Sector picker */}
            <div>
              <p className="text-[0.775rem] text-text-muted uppercase tracking-widest mb-3">
                Sector focus · pick up to 2
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SECTORS.map((s) => <Chip key={s} label={s} active={ACTIVE_SECTORS.has(s)} />)}
              </div>
            </div>
          </div>

          {/* Right: profile cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROFILES.map((p) => <ProfileCard key={p.name} {...p} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
"use client";

const ROLES = [
  { icon: "🎓", label: "Current students",  desc: "Undergrad, postgrad, and PhD students building while they study." },
  { icon: "⚡", label: "Recent grads",       desc: "Within 3 years of graduating — figuring it out and moving fast." },
  { icon: "🚀", label: "Alumni founders",    desc: "Imperial alumni who've been through it and want to give back." },
  { icon: "🧭", label: "Mentors",            desc: "Operators and experts who make themselves available to the community." },
  { icon: "💡", label: "Angel investors",    desc: "Angels actively looking at early-stage Imperial-connected startups." },
  { icon: "🔬", label: "Staff & faculty",    desc: "Researchers and professors bridging academia and the startup world." },
];

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-8 h-px bg-gold shrink-0" />
      <span className="text-gold text-[0.75rem] font-medium tracking-[0.1em] uppercase">
        {text}
      </span>
    </div>
  );
}

function RoleCard({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="p-5 rounded-xl bg-bg-card border border-border-subtle cursor-default transition-all duration-200 hover:border-gold/30 hover:bg-bg-card-hover">
      <div className="text-xl mb-2">{icon}</div>
      <div className="text-sm font-medium text-text-primary mb-1.5">{label}</div>
      <div className="text-[0.775rem] text-text-muted leading-relaxed">{desc}</div>
    </div>
  );
}

export default function WhoWeAre() {
  return (
    <section id="who-we-are" className="py-28 px-8 max-w-[1200px] mx-auto">
      <SectionLabel text="Who are we?" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
        {/* Left: copy */}
        <div>
          <h2 className="font-display text-text-primary leading-[1.15] tracking-tight mb-6 text-[clamp(2rem,3.5vw,3rem)]">
            Not a society.
            <br />
            Not a networking event.
            <br />
            <em className="text-gold">A community with skin in the game.</em>
          </h2>
          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.75] mb-5">
            Foundry was built by Imperial students who were frustrated with the gap
            between academic brilliance and startup support. We wanted direct access
            to people who&apos;d been where we were — not polished panel speakers, but
            actual founders, still in the trenches.
          </p>
          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.75]">
            Today, Foundry is the connective tissue of the Imperial startup ecosystem —
            a private network where introductions are warm, opportunities are real,
            and membership is earned.
          </p>
          {/* Access note */}
          <div className="mt-8 p-4 bg-bg-card border border-border-subtle rounded-xl flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-gold mt-[7px] shrink-0" />
            <p className="text-[0.825rem] text-text-secondary leading-relaxed">
              Access is verified via{" "}
              <span className="text-text-primary">@imperial.ac.uk</span>
              {" "}email or approved alumni addresses. Membership is free.
            </p>
          </div>
        </div>

        {/* Right: role cards */}
        <div className="grid grid-cols-2 gap-3">
          {ROLES.map((role) => <RoleCard key={role.label} {...role} />)}
        </div>
      </div>
    </section>
  );
}
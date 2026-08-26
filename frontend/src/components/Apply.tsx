"use client";

/* ── Data ─────────────────────────────────────────────────────────── */
const STEPS = [
  {
    step: "01",
    title: "Identity",
    desc: "Name, Imperial email, and your role in the ecosystem.",
  },
  {
    step: "02",
    title: "Your work",
    desc: "A one-line bio, skills, sector focus, and what you're looking for.",
  },
  {
    step: "03",
    title: "Visibility",
    desc: "Choose what you're open to — intros, work opportunities, co-founder conversations.",
  },
];

const ROLE_OPTIONS = [
  "Current student", "Recent grad", "Alumni founder", "Mentor", "Angel investor",
];

/* ── Sub-components ───────────────────────────────────────────────── */
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="w-8 h-px bg-gold shrink-0" />
      <span className="text-gold text-[0.75rem] font-medium tracking-[0.1em] uppercase">{text}</span>
    </div>
  );
}

function StepItem({ step, title, desc, isLast }: { step: string; title: string; desc: string; isLast: boolean }) {
  return (
    <div className={`relative flex gap-5 ${!isLast ? "pb-7" : ""}`}>
      {/* Vertical connector */}
      {!isLast && (
        <div className="absolute left-4 top-8 bottom-0 w-px bg-border-subtle" />
      )}

      {/* Circle */}
      <div className="w-8 h-8 rounded-full shrink-0 z-10 flex items-center justify-center border border-gold/30 bg-gold/8 text-gold text-[0.7rem] font-medium">
        {step}
      </div>

      <div>
        <div className="text-[0.9rem] font-medium text-text-primary mb-1">{title}</div>
        <p className="text-[0.825rem] text-text-secondary font-light leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* Mocked form preview — mirrors the actual signup form's visual */
function FormPreview() {
  return (
    <div className="rounded-2xl bg-bg-card border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border-subtle">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[0.85rem] font-medium text-text-primary">
            Form 1 — Member profile signup · Step 1 of 3: Identity
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-0.5 bg-border rounded-full">
          <div className="h-full w-1/3 bg-gold rounded-full" />
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          {[["First name", "John"], ["Last name", "Doe"]].map(([label, placeholder]) => (
            <div key={label}>
              <p className="text-[0.72rem] text-text-muted mb-1.5">{label}</p>
              <div className="px-3.5 py-2.5 bg-white/[0.03] border border-border rounded-lg text-[0.825rem] text-text-muted">
                {placeholder}
              </div>
            </div>
          ))}
        </div>

        {/* Email */}
        <div>
          <p className="text-[0.72rem] text-text-muted mb-1.5">Imperial email · used to verify access</p>
          <div className="px-3.5 py-2.5 bg-white/[0.03] border border-border rounded-lg text-[0.825rem] text-text-muted">
            username@imperial.ac.uk
          </div>
          <p className="text-[0.68rem] text-text-muted mt-1.5">
            Students: @imperial.ac.uk or @ic.ac.uk. Alumni: sign in with Google, admin-verified before access.
          </p>
        </div>

        {/* Role chips */}
        <div>
          <p className="text-[0.72rem] text-text-muted mb-2">I am a…</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_OPTIONS.map((r) => (
              <span
                key={r}
                className={r === "Current student" ? "px-3 py-1 rounded-full text-[0.75rem] border border-gold text-gold bg-gold/10" : "px-3 py-1 rounded-full text-[0.75rem] border border-border text-text-muted"}
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex justify-between items-center pt-4 border-t border-border-subtle">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={i === 0 ? "h-2 rounded-full w-6 bg-gold" : "h-2 rounded-full w-2 bg-border"}
              />
            ))}
          </div>
          <button
            disabled
            className="px-4 py-1.5 rounded-full bg-gold text-bg-primary text-[0.775rem] font-medium opacity-40 cursor-not-allowed"
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}


export default function Apply() {
  return (
    <section id="apply" className="py-28 pb-32 px-8 max-w-[1200px] mx-auto">
      <SectionLabel text="Apply" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
        <div>
          <h2 className="font-display leading-[1.1] tracking-tight mb-6 text-[clamp(2rem,3.5vw,3rem)]">
            Join Foundry in
            <br />
            a few minutes.
            <br />
            <em className="text-gold">That&apos;s it.</em>
          </h2>

          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.75] mb-10">
            Current students get in instantly with an Imperial email. Alumni sign in
            with Google and are admitted after a quick admin check. Then build your
            profile and start meeting people.
          </p>

          <div className="mb-10">
            {STEPS.map((s, i) => (
              <StepItem key={s.step} {...s} isLast={i === STEPS.length - 1} />
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full no-underline bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide transition-all duration-200 hover:bg-gold-light hover:-translate-y-px"
            >
              Join Foundry →
            </a>
            <span className="text-[0.8rem] text-text-muted">
              Free · Imperial students &amp; verified alumni
            </span>
          </div>
        </div>

        <FormPreview />
      </div>
    </section>
  );
}
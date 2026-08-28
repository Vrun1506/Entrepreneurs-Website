import { SectionHead } from "@/components/SectionHead";

const ROLES = [
  { label: "Current students", desc: "Undergrad, postgrad, and PhD students building while they study." },
  { label: "Recent grads",     desc: "Within 3 years of graduating — figuring it out and moving fast." },
  { label: "Alumni founders",  desc: "Imperial alumni who've been through it and want to give back." },
  { label: "Mentors",          desc: "Operators and experts who make themselves available to the community." },
  { label: "Angel investors",  desc: "Angels actively looking at early-stage Imperial-connected startups." },
  { label: "Staff & faculty",  desc: "Researchers and professors bridging academia and the startup world." },
];

export default function WhoWeAre() {
  return (
    <section id="who-we-are" className="mx-auto max-w-[1200px] px-8 py-24">
      {/* Treatment 1 of 5: one weight, held. The section that states what the
          thing *is* does not need the sentence broken across registers. */}
      <SectionHead label="Who are we?">
        <h2 className="max-w-[16ch] text-[clamp(2rem,3.6vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-text-primary">
          A community with skin in the game.
        </h2>
      </SectionHead>

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-14 md:grid-cols-[10rem_1fr] lg:grid-cols-[10rem_1fr_1fr]">
        <div className="hidden md:block" />

        <div className="max-w-[62ch]">
          <p className="mb-5 text-[0.95rem] leading-[1.75] text-text-secondary">
            Foundry was built by Imperial students who were frustrated with the gap
            between academic brilliance and startup support. We wanted direct access
            to people who&apos;d been where we were — actual founders, still in the
            trenches.
          </p>
          <p className="text-[0.95rem] leading-[1.75] text-text-secondary">
            Today, Foundry is the connective tissue of the Imperial startup ecosystem —
            a private network where introductions are warm, opportunities are real,
            and membership is earned.
          </p>

          {/* The access rule. Previously a card with a gold dot; now a marked
              note — the rule carries the emphasis the dot was carrying. */}
          <p className="mt-8 border-l-2 border-border-strong pl-5 text-[0.85rem] leading-[1.7] text-text-secondary">
            Access is verified through your Imperial student email{" "}
            <span className="data text-text-primary">@imperial.ac.uk</span> or{" "}
            <span className="data text-text-primary">@ic.ac.uk</span>. Alumni go through a
            quick admin verification before being admitted. Membership is free.
          </p>
        </div>

        {/* Six roles as a ruled definition list rather than six bulleted rows:
            the label column is the same column the section head uses, so the
            page reads down one spine. */}
        <div>
          <h3 className="label-wide mb-5 text-text-muted">Who can join</h3>
          <dl className="border-t border-border-subtle">
            {ROLES.map((role) => (
              <div key={role.label} className="border-b border-border-subtle py-4">
                <dt className="text-[0.9rem] font-medium text-text-primary">{role.label}</dt>
                <dd className="mt-1 text-[0.85rem] leading-relaxed text-text-muted">{role.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

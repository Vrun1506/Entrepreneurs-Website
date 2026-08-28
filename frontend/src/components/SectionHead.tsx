import type { ReactNode } from "react";

// ════════════════════════════════════════════════════════════════════
// Foundry · SectionHead
//
// Replaces the `SectionLabel` that was pasted into WhoWeAre, Community,
// Opportunities, Events and Apply — a short gold rule beside a gold
// uppercase word, above the heading. Five copies of it made every section
// on the page open the same way.
//
// What it becomes is the title block of a technical drawing: a rule across
// the full measure, the section's name set tight beneath it in the wide
// register, and the heading at the page's own left margin with the whole
// width to work in. The name is load-bearing — the nav's scroll-spy points
// at these anchors — but it is part of the rule band now, not a decorative
// kicker floating over an indented heading.
//
// `aside` is the supporting line two sections set beside their heading. It
// shares the heading's row so the band reads as one horizontal register.
// ════════════════════════════════════════════════════════════════════

export function SectionHead({
  label, children, aside,
}: {
  /** Matches the nav link text and the section's anchor id. */
  label: string;
  /** The heading. Each section sets its own treatment. */
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="rule-draw mb-12 pt-4">
      <p className="label-wide mb-7 text-text-muted">{label}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-16 gap-y-6">
        {children}
        {aside}
      </div>
    </header>
  );
}

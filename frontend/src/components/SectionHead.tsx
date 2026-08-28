import type { ReactNode } from "react";

// ════════════════════════════════════════════════════════════════════
// Foundry · SectionHead
//
// Replaces the `SectionLabel` that was pasted into WhoWeAre, Community,
// Opportunities, Events and Apply — a short gold rule beside a gold
// uppercase word, sitting above the heading. That is the decorative eyebrow,
// and five copies of it made every section on the page open the same way.
//
// What it becomes is the grammar the logo already uses and a datasheet is
// built from: a rule across the full measure, the field name in the left
// column, the value in the right. The section name is still there — the nav
// scroll-spy points at these anchors and dropping it would break the mapping
// between "Community" in the nav and the thing it scrolls to — but it is now
// a column heading beside the title rather than a label floating above it.
//
// `aside` is the supporting line two of the sections set to the right of
// their heading. It sits in the same row rather than under the title, so the
// rule reads as one horizontal band.
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
    <header className="border-t border-border pt-6 mb-14">
      <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-x-10 gap-y-6">
        <p className="label-wide text-text-secondary">{label}</p>

        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
          {children}
          {aside}
        </div>
      </div>
    </header>
  );
}

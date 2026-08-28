import Link from "next/link";
import type { ReactNode } from "react";
import AppNav from "@/components/AppNav";
import SubmittedBanner from "@/components/SubmittedBanner";

// The chrome shared by /opportunities, /events and /vcs: nav, main
// landmark, the masthead (section name + heading + count), and the
// "post one" CTA.
// It was written out three times, and had already drifted — /vcs used a
// different heading wrapper from the other two.
//
// Deliberately not generalised past these three. /community and
// /my-bookmarks look similar but differ in ways that would turn this into
// a component with a prop per page.
export default function ListingPageShell({
  active, isAdmin, justSubmitted, submittedKind,
  eyebrow, title, summary, cta, actions, children,
}: {
  active: "opportunities" | "events" | "vcs";
  isAdmin: boolean;
  justSubmitted: boolean;
  /** Noun for the post-submission banner, e.g. "opportunity". */
  submittedKind: string;
  eyebrow: string;
  title: string;
  /** One line under the heading, usually the item count. May be a suspended
   *  node when the count depends on the data being streamed in. */
  summary: ReactNode;
  cta: { href: string; label: string };
  /** Extra links beside the CTA (only /opportunities has any). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active={active} isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          {justSubmitted && <SubmittedBanner kind={submittedKind} />}
          {/* Same masthead grammar as the marketing sections: a rule across
              the measure, the section name in the field-name column, the
              heading in the value column. `eyebrow` was previously set as a
              gold uppercase kicker floating above the h1 on all three of
              these pages — the words were already a column heading, they were
              just being drawn as decoration. */}
          <header className="mb-8 border-t border-border pt-6">
            <div className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-[10rem_1fr]">
              <p className="label-wide text-text-secondary">{eyebrow}</p>

              <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
                <div className="min-w-0">
                  <h1 className="text-[clamp(1.7rem,3.2vw,2.4rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-text-primary">
                    {title}
                  </h1>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-text-muted">{summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {actions}
                  <Link
                    href={cta.href}
                    className="rounded-lg bg-accent px-4 py-2 text-[0.825rem] font-semibold text-bg-primary no-underline transition-colors duration-150 hover:bg-accent-dim"
                  >
                    {cta.label}
                  </Link>
                </div>
              </div>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}

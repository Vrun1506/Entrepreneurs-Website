import Link from "next/link";
import type { ReactNode } from "react";
import AppNav from "@/components/AppNav";
import SubmittedBanner from "@/components/SubmittedBanner";

// The chrome shared by /opportunities, /events and /vcs: nav, main
// landmark, the eyebrow + heading + count block, and the "post one" CTA.
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
  /** One line under the heading, usually the item count. */
  summary: string;
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
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">{eyebrow}</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                {title}
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">{summary}</p>
            </div>
            <div className="flex items-center gap-3">
              {actions}
              <Link
                href={cta.href}
                className="px-4 py-2 rounded-full bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors duration-150 hover:bg-gold-light"
              >
                {cta.label}
              </Link>
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

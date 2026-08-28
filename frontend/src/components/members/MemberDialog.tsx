"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SocialLinks from "@/components/SocialLinks";
import { Dialog, closeDialog } from "@/components/ui/Dialog";
import { browserClient } from "@/lib/supabase/browser";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DirectoryMember } from "@/lib/data/directory";

// ════════════════════════════════════════════════════════════════════
// Foundry · The member profile dialog, and the subtitle line it shares
// with every card that can open it.
//
// Lifted out of members/MembersClient when /home grew its own strip of
// member cards. Two copies of a dialog that fetches a profile is exactly
// the duplication lib/data/query.ts was written to stop; this is the
// same argument one layer up.
// ════════════════════════════════════════════════════════════════════

const MAX_LOOKING_FOR = 3;

// The fields the list deliberately doesn't carry.
type FullProfile = {
  bio: string | null;
  working_on: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
};

export function MemberDialog({ member: m, onClose }: { member: DirectoryMember; onClose: () => void }) {
  // Fetched on open rather than shipped with the list. A plain select, not
  // an RPC: the profiles RLS policies already restrict reads to approved
  // members, so there is nothing extra to enforce here.
  const [full, setFull] = useState<FullProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    browserClient()
      .from("profiles")
      .select("bio, working_on, linkedin_url, github_url, portfolio_url")
      .eq("id", m.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          console.error("Failed to load profile details:", error);
          setLoadFailed(true);
          return;
        }
        setFull(data as FullProfile);
      });
    return () => { cancelled = true; };
  }, [m.id]);

  return (
    <Dialog
      onClose={onClose}
      label={`Profile of ${m.firstName} ${m.surname}`}
      className="w-full max-w-[600px] rounded-2xl bg-bg-card border border-border shadow-2xl my-auto"
    >
      <header className="flex items-start justify-between gap-4 px-7 pt-6 pb-4 border-b border-border-subtle">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.4rem] text-text-primary tracking-tight truncate">
            {m.firstName} {m.surname}
          </h2>
          <div className="text-[0.75rem] text-text-muted mt-1">{memberSubtitle(m)}</div>
          {m.course && (
            <div className="text-[0.8rem] text-text-secondary mt-1">{m.course}</div>
          )}
        </div>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="Close"
          className="shrink-0 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer border-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="px-7 py-5 space-y-5">
        {/* While the full text loads, show the preview the card already has
            rather than an empty box — the dialog opens with content, and the
            untruncated version replaces it in place. */}
        {(full?.bio ?? m.bioPreview) && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1.5">Bio</div>
            <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {full?.bio ?? m.bioPreview}
            </p>
            {!full && !loadFailed && <Skeleton className="h-3 w-2/3 mt-2" />}
          </section>
        )}

        {(full?.working_on ?? m.workingOnPreview) && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1.5">Working on</div>
            <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {full?.working_on ?? m.workingOnPreview}
            </p>
          </section>
        )}

        {m.lookingFor.length > 0 && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Looking for</div>
            <div className="flex flex-wrap gap-1.5">
              {m.lookingFor.slice(0, MAX_LOOKING_FOR).map((lf) => (
                <Link
                  key={lf.id}
                  href={`/opportunities?o=${lf.id}`}
                  className="rounded-lg border border-border-strong px-2.5 py-1 text-[0.725rem] text-text-primary no-underline transition-colors hover:border-accent hover:bg-white/[0.06]"
                >
                  {lf.role}
                </Link>
              ))}
            </div>
          </section>
        )}

        {m.sectors.length > 0 && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Interests</div>
            <div className="flex flex-wrap gap-1.5">
              {m.sectors.map((s) => (
                <span key={`sec-${s}`} className="px-2.5 py-1 rounded-lg text-[0.725rem] bg-accent-muted text-accent-light border border-accent/20">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {m.skills.length > 0 && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Skills &amp; expertise</div>
            <div className="flex flex-wrap gap-1.5">
              {m.skills.map((s) => (
                <span key={`skl-${s}`} className="px-2.5 py-1 rounded-lg text-[0.725rem] bg-white/[0.03] text-text-secondary border border-border">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {full && (full.linkedin_url || full.github_url || full.portfolio_url) && (
          <section className="pt-3 border-t border-border-subtle">
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Links</div>
            <SocialLinks
              linkedinUrl={full.linkedin_url}
              githubUrl={full.github_url}
              portfolioUrl={full.portfolio_url}
            />
          </section>
        )}

        {/* Only claim the profile is empty once we know: the links and the
            full text arrive after the dialog opens. */}
        {full && !full.bio && !full.working_on && m.sectors.length === 0 && m.skills.length === 0
          && m.lookingFor.length === 0 && !full.linkedin_url && !full.github_url && !full.portfolio_url && (
          <p className="text-[0.85rem] text-text-muted italic">
            No additional details on this profile yet.
          </p>
        )}
      </div>
    </Dialog>
  );
}

export function memberSubtitle(m: DirectoryMember) {
  if (m.role === "alum") return `Alum · ${m.gradYear ?? "—"}`;
  return m.gradYear ? `Student · class of ${m.gradYear}` : "Imperial student";
}

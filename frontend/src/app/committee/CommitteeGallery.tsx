"use client";

import { useEffect, useState } from "react";
import { MemberCard } from "@/components/members/MemberCard";
import { MemberDialog } from "@/components/members/MemberDialog";
import type { CommitteeMember } from "@/lib/data/committee";

// ════════════════════════════════════════════════════════════════════
// Foundry · The committee gallery
//
// One member at a time with prev/next arrows, rather than the directory's
// scrolling grid — a committee is ~30 people, small enough that paging
// through them one-by-one is the point (this is a "who's on committee"
// browse, not a search). Reuses MemberCard/MemberDialog rather than a
// bespoke layout, so the gold committee banner (drawn once, in
// MemberPhoto) and the profile dialog behave identically here and in the
// ordinary directory.
// ════════════════════════════════════════════════════════════════════

export default function CommitteeGallery({ members }: { members: CommitteeMember[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<CommitteeMember | null>(null);

  const prev = () => setIndex((i) => (i - 1 + members.length) % members.length);
  const next = () => setIndex((i) => (i + 1) % members.length);

  // Arrow-key paging, matching the click targets — off while the profile
  // dialog is open so its own keyboard handling (e.g. Escape) isn't raced.
  useEffect(() => {
    if (open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prev/next close over members.length, not index
  }, [open, members.length]);

  const current = members[index];
  if (!current) return null;

  return (
    <div className="mx-auto max-w-[380px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous committee member"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-white/[0.04] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <MemberCard member={current} onClick={() => setOpen(current)} />
        </div>

        <button
          type="button"
          onClick={next}
          aria-label="Next committee member"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-white/[0.04] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
      </div>

      <p className="mt-4 text-center text-[0.7rem] font-mono text-text-muted">
        {index + 1} of {members.length}
      </p>

      {open && <MemberDialog member={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

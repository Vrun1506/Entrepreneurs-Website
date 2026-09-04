"use client";

import { useEffect, useState } from "react";
import { MemberCard } from "@/components/members/MemberCard";
import { MemberDialog } from "@/components/members/MemberDialog";
import type { CommitteeMember } from "@/lib/data/committee";

// ════════════════════════════════════════════════════════════════════
// Foundry · The committee gallery
//
// A page of up to PAGE_SIZE members at a time with prev/next arrows,
// rather than the directory's scrolling grid — a committee is ~30
// people, small enough that paging through them in handfuls is the
// point (this is a "who's on committee" browse, not a search). Reuses
// MemberCard (in its dense, five-across form — see NewestMembers) and
// MemberDialog rather than a bespoke layout, so the gold committee
// banner (drawn once, in MemberPhoto) and the profile dialog behave
// identically here and in the ordinary directory.
//
// A trailing page that isn't full (committee count not divisible by
// PAGE_SIZE) is centred rather than left-hanging: the row is a flex
// container with justify-center, not a grid, so a short last page has
// no empty trailing cells pulling it visually to one side.
// ════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 5;

export default function CommitteeGallery({ members }: { members: CommitteeMember[] }) {
  const totalPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<CommitteeMember | null>(null);

  const prev = () => setPage((p) => (p - 1 + totalPages) % totalPages);
  const next = () => setPage((p) => (p + 1) % totalPages);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prev/next close over totalPages, not page
  }, [open, totalPages]);

  if (members.length === 0) return null;

  const visible = members.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="flex flex-wrap justify-center gap-3">
        {visible.map((m) => (
          <div key={m.id} className="w-[140px] shrink-0 sm:w-[168px]">
            <MemberCard member={m} dense onClick={() => setOpen(m)} />
          </div>
        ))}
      </div>

      {/* Arrows sit below the row, not flanking it — flanking works for a
          single card but reads oddly once a short last page (or a narrow
          viewport) wraps the row to multiple lines and the arrows end up
          centred against the whole stack instead of any one card. */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous committee members"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-white/[0.04] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>

        <p className="w-24 text-center text-[0.7rem] font-mono text-text-muted">
          Page {page + 1} of {totalPages}
        </p>

        <button
          type="button"
          onClick={next}
          aria-label="Next committee members"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-strong bg-white/[0.04] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 4l6 6-6 6" />
          </svg>
        </button>
      </div>

      {open && <MemberDialog member={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

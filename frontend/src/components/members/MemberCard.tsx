"use client";

import Link from "next/link";
import { MemberPhoto } from "./MemberPhoto";
import { memberSubtitle } from "./MemberDialog";
import type { DirectoryMember } from "@/lib/data/directory";

const MAX_LOOKING_FOR = 3;

// ════════════════════════════════════════════════════════════════════
// Foundry · Member card — directory grid and the "newest members" strip
//
// Shared rather than two bespoke cards: the photo-leads-details layout
// is the same in both places, and `dense` is the only real difference
// (the strip drops bio/hobbies/"looking for" so five can sit in a row
// without crowding). role="button" on a div, not a real <button> — the
// same reason MembersClient's original card used it: the "Looking for"
// links below need to nest inside without invalid interactive-in-
// interactive HTML.
// ════════════════════════════════════════════════════════════════════

export function MemberCard({
  member: m,
  onClick,
  dense = false,
}: {
  member: DirectoryMember;
  onClick: () => void;
  dense?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className={`overflow-hidden rounded-2xl border transition-colors duration-150 cursor-pointer group ${
        dense
          ? "bg-accent-muted/30 border-accent/20 hover:border-accent hover:bg-accent-muted/40"
          : "bg-bg-card border-border hover:border-accent hover:bg-bg-card/80"
      }`}
    >
      <MemberPhoto member={m} aspect="aspect-square" rounded="rounded-t-2xl" />

      <div className={`border-t border-border ${dense ? "p-3" : "p-4"}`}>
        <div className={`font-medium text-text-primary truncate ${dense ? "text-[0.875rem]" : "text-[0.95rem]"}`}>
          {m.firstName} {m.surname}
        </div>
        <div className={`text-text-muted mt-0.5 truncate ${dense ? "text-[0.7rem]" : "text-[0.725rem]"}`}>
          {memberSubtitle(m)}
        </div>
        {m.course && (
          <div className={`text-text-secondary mt-1 truncate ${dense ? "text-[0.7rem]" : "text-[0.725rem]"}`}>
            {m.course}
          </div>
        )}

        {!dense && m.bioPreview && (
          <p className="mt-3 line-clamp-2 break-words text-[0.8rem] leading-relaxed text-text-secondary">
            {m.bioPreview}
          </p>
        )}

        {!dense && m.hobbiesPreview && (
          <div className="mt-2 line-clamp-1 break-all text-[0.75rem] leading-relaxed text-text-muted">
            <span className="label-wide text-text-muted">Outside of that:</span> {m.hobbiesPreview}
          </div>
        )}

        {!dense && m.lookingFor.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 mt-3 text-[0.7rem] text-text-muted">
            <span>Looking for</span>
            {m.lookingFor.slice(0, MAX_LOOKING_FOR).map((lf) => (
              <Link
                key={lf.id}
                href={`/opportunities/${lf.id}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-lg border border-border-strong px-2 py-0.5 text-[0.7rem] text-text-primary no-underline transition-colors hover:border-accent hover:bg-white/[0.06]"
              >
                {lf.role}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

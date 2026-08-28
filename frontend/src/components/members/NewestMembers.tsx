"use client";

import { useState } from "react";
import { MemberDialog, memberSubtitle } from "./MemberDialog";
import type { DirectoryMember } from "@/lib/data/directory";

// ════════════════════════════════════════════════════════════════════
// Foundry · "Some of our newest members…"
//
// Was a block inside members/MembersClient. It lives on /home now, which
// is a server component — so the strip carries its own dialog state
// rather than borrowing the directory's. The markup is unchanged: this
// is the same strip, not a second one that looks like it.
// ════════════════════════════════════════════════════════════════════

export default function NewestMembers({ newest }: { newest: DirectoryMember[] }) {
  const [openMember, setOpenMember] = useState<DirectoryMember | null>(null);

  return (
    <>
      {newest.length > 0 && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-text-primary text-[1.25rem] tracking-tight">
              Some of our newest members…
            </h2>
            <span className="text-[0.7rem] text-text-muted">{newest.length} just joined</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {newest.map((m) => <NewestCard key={m.id} member={m} onClick={() => setOpenMember(m)} />)}
          </div>
        </section>
      )}

      {openMember && (
        <MemberDialog member={openMember} onClose={() => setOpenMember(null)} />
      )}
    </>
  );
}

function NewestCard({ member: m, onClick }: { member: DirectoryMember; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-4 rounded-2xl bg-accent-muted/30 border border-accent/20 hover:border-accent hover:bg-accent-muted/40 transition-colors duration-150 cursor-pointer"
    >
      <div className="text-[0.875rem] font-medium text-text-primary truncate">
        {m.firstName} {m.surname}
      </div>
      <div className="text-[0.7rem] text-text-muted mt-0.5 truncate">
        {memberSubtitle(m)}
      </div>
      {m.course && (
        <div className="mt-2 line-clamp-2 break-words text-[0.7rem] text-text-secondary">{m.course}</div>
      )}
    </button>
  );
}

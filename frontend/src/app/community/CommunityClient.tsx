"use client";

import { useMemo, useState } from "react";

type Member = {
  id: string;
  firstName: string;
  surname: string;
  role: "alum" | "student";
  gradYear: number | null;
  bio: string | null;
  workingOn: string | null;
  linkedinUrl: string | null;
  skills: string[];
  sectors: string[];
};

export default function CommunityClient({ members }: { members: Member[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const haystack = [
        m.firstName, m.surname, `${m.firstName} ${m.surname}`,
        m.bio ?? "", m.workingOn ?? "",
        ...m.skills, ...m.sectors,
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query]);

  return (
    <>
      <div className="mb-8">
        <input
          type="search"
          placeholder="Search by name, skill, sector, or what they're working on"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {members.length === 0 ? "No members yet." : "No members match your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => <MemberCard key={m.id} member={m} />)}
        </div>
      )}
    </>
  );
}

function MemberCard({ member: m }: { member: Member }) {
  return (
    <article className="p-5 rounded-2xl bg-bg-card border border-border-subtle hover:border-border transition-colors duration-150">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[0.95rem] font-medium text-text-primary">
            {m.firstName} {m.surname}
          </div>
          <div className="text-[0.725rem] text-text-muted mt-0.5">
            {m.role === "alum" ? `Alum · ${m.gradYear ?? "—"}` : "Imperial student"}
          </div>
        </div>
        {m.linkedinUrl && (
          <a
            href={m.linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.7rem] text-text-muted hover:text-gold no-underline transition-colors"
            aria-label="LinkedIn"
          >
            LinkedIn ↗
          </a>
        )}
      </header>

      {m.bio && (
        <p className="text-[0.8rem] text-text-secondary leading-relaxed mb-3 line-clamp-3">
          {m.bio}
        </p>
      )}

      {m.workingOn && (
        <div className="text-[0.75rem] text-text-muted mb-3 leading-relaxed">
          <span className="text-gold/80">Working on:</span> {m.workingOn}
        </div>
      )}

      {(m.skills.length > 0 || m.sectors.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-subtle">
          {m.sectors.map((s) => (
            <span key={`sec-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-gold-muted text-gold-light border border-gold/20">
              {s}
            </span>
          ))}
          {m.skills.map((s) => (
            <span key={`skl-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-white/[0.03] text-text-secondary border border-border">
              {s}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

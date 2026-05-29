"use client";

import { useMemo, useState } from "react";

type Opportunity = {
  id: string;
  positionName: string;
  company: string;
  pay: string;
  locationType: "remote" | "hybrid" | "onsite";
  locationText: string | null;
  description: string;
  startMonth: number;
  startYear: number;
  applicationDeadline: string;
  contactEmail: string | null;
  applyMethod: "email" | "link";
  applyUrl: string | null;
  postedBy: { firstName: string; surname: string; linkedinUrl: string | null };
  skills: string[];
  sectors: string[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function OpportunitiesClient({ items }: { items: Opportunity[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((o) => {
      const hay = [
        o.positionName, o.company, o.pay, o.description,
        o.postedBy.firstName, o.postedBy.surname,
        o.locationText ?? "",
        ...o.skills, ...o.sectors,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <>
      <div className="mb-8">
        <input
          type="search"
          placeholder="Search by role, company, skill, sector, or poster"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {items.length === 0 ? "No opportunities posted yet." : "No opportunities match your search."}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((o) => <OpportunityCard key={o.id} opportunity={o} />)}
        </div>
      )}
    </>
  );
}

function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
  const [open, setOpen] = useState(false);

  const start = `${MONTHS[o.startMonth - 1]} ${o.startYear}`;
  const deadline = new Date(o.applicationDeadline).toLocaleDateString("en-GB", {
    year: "numeric", month: "short", day: "numeric",
  });
  const location =
    o.locationType === "remote"
      ? "Remote"
      : o.locationType === "hybrid"
      ? `Hybrid${o.locationText ? ` · ${o.locationText}` : ""}`
      : o.locationText || "Onsite";

  return (
    <article className="rounded-2xl bg-bg-card border border-border-subtle overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-5 text-left bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[1.05rem] font-medium text-text-primary">
              {o.positionName}
            </div>
            <div className="text-[0.8rem] text-text-muted mt-1">
              {o.company} · {location} · Starts {start}
            </div>
          </div>
          <div className="text-[0.75rem] text-gold-light shrink-0">
            {o.pay}
          </div>
        </div>

        {(o.sectors.length > 0 || o.skills.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {o.sectors.map((s) => (
              <span key={`sec-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-gold-muted text-gold-light border border-gold/20">{s}</span>
            ))}
            {o.skills.map((s) => (
              <span key={`skl-${s}`} className="px-2 py-0.5 rounded-full text-[0.7rem] bg-white/[0.03] text-text-secondary border border-border">{s}</span>
            ))}
          </div>
        )}

        <div className="text-[0.7rem] text-text-muted mt-3">
          {open ? "▾ Hide details" : "▸ Show details"} · Apply by {deadline}
        </div>
      </button>

      {open && (
        <div className="px-6 pb-6 pt-1 border-t border-border-subtle">
          <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1 mt-4">Description</div>
          <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">{o.description}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 text-[0.8rem]">
            <div>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">Posted by</div>
              <div className="text-text-secondary">
                {o.postedBy.firstName} {o.postedBy.surname}
              </div>
              {o.postedBy.linkedinUrl && (
                <a
                  href={o.postedBy.linkedinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[0.75rem] text-gold no-underline hover:underline"
                >
                  LinkedIn ↗
                </a>
              )}
            </div>
            <div>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">Apply by</div>
              <div className="text-text-secondary">{deadline}</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">How to apply</div>
            {o.applyMethod === "link" && o.applyUrl ? (
              <a
                href={o.applyUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
              >
                Open application portal ↗
              </a>
            ) : o.contactEmail ? (
              <a
                href={`mailto:${o.contactEmail}?subject=${encodeURIComponent(o.positionName)}`}
                className="inline-block px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
              >
                Email {o.contactEmail} ↗
              </a>
            ) : (
              <p className="text-[0.8rem] text-text-secondary">
                Contact <span className="text-text-primary">{o.postedBy.firstName} {o.postedBy.surname}</span> via LinkedIn to apply.
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

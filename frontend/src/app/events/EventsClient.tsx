"use client";

import { useMemo, useState } from "react";

type FoundryEvent = {
  id: string;
  title: string;
  description: string;
  lumaLink: string;
  eventAt: string;
  location: string;
  organiserName: string;
  contactEmail: string | null;
  postedBy: { firstName: string; surname: string; linkedinUrl: string | null };
};

export default function EventsClient({ items }: { items: FoundryEvent[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) => {
      const hay = [
        e.title, e.description, e.location, e.organiserName,
        e.postedBy.firstName, e.postedBy.surname,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <>
      <div className="mb-8">
        <input
          type="search"
          placeholder="Search events"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {items.length === 0 ? "No upcoming events." : "No events match your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((e) => <EventCard key={e.id} ev={e} />)}
        </div>
      )}
    </>
  );
}

function EventCard({ ev }: { ev: FoundryEvent }) {
  const when = new Date(ev.eventAt).toLocaleString("en-GB", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <article className="p-6 rounded-2xl bg-bg-card border border-border-subtle transition-colors duration-150 hover:border-border">
      <div className="text-[0.7rem] text-gold tracking-[0.14em] uppercase mb-2">{when}</div>
      <div className="text-[1.05rem] font-medium text-text-primary mb-2">{ev.title}</div>
      <div className="text-[0.8rem] text-text-muted mb-3">
        {ev.location} · Organised by {ev.organiserName}
      </div>
      <p className="text-[0.85rem] text-text-secondary leading-relaxed mb-4 line-clamp-4">
        {ev.description}
      </p>

      <div className="flex flex-wrap gap-3 items-center pt-3 border-t border-border-subtle">
        <a
          href={ev.lumaLink}
          target="_blank"
          rel="noreferrer noopener"
          className="px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.8rem] font-medium no-underline transition-colors hover:bg-gold-light"
        >
          RSVP on Luma ↗
        </a>
        {ev.contactEmail && (
          <a
            href={`mailto:${ev.contactEmail}?subject=${encodeURIComponent(ev.title)}`}
            className="text-[0.8rem] text-text-secondary no-underline hover:text-text-primary"
          >
            Email organiser ↗
          </a>
        )}
      </div>
    </article>
  );
}

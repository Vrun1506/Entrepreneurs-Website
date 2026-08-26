"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useListingFreshness } from "@/lib/useListingFreshness";
import { ListingGoneNotice } from "@/components/ListingGoneNotice";
import { MarkActionPill } from "@/components/MarkActionPill";
import { AddToCalendarMenu } from "@/components/AddToCalendarMenu";
import { recordListingEvent } from "@/lib/analytics";
import { formatDateWeekday } from "@/lib/dates";

type FoundryEvent = {
  id: string;
  title: string;
  description: string;
  lumaLink: string;
  eventAt: string;
  location: string;
  organiserName: string;
  contactEmail: string | null;
  isSocietyEvent: boolean;
  postedBy: { firstName: string; surname: string; linkedinUrl: string | null };
};

type Mode = "all" | "online" | "in_person";

// Mirrors the auto-detection on the card itself so the filter is a
// pure overlay of the same logic.
const ONLINE_RE = /online|zoom|google meet|teams|lu\.ma|webinar|virtual/i;

export default function EventsClient({
  items, goingIds = [],
}: {
  items: FoundryEvent[];
  /** Event IDs the current user has self-marked as going. */
  goingIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("all");
  const [from, setFrom] = useState<string>("");
  const [to,   setTo]   = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const goingSet = useMemo(() => new Set(goingIds), [goingIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs   = to   ? new Date(`${to}T23:59:59.999`).getTime() : null;
    const visible = items.filter((e) => !dismissed.has(e.id));
    return visible.filter((e) => {
      const isOnline = ONLINE_RE.test(e.location);
      if (mode === "online"    && !isOnline) return false;
      if (mode === "in_person" &&  isOnline) return false;

      const eventMs = new Date(e.eventAt).getTime();
      if (fromMs != null && eventMs < fromMs) return false;
      if (toMs   != null && eventMs > toMs)   return false;

      if (q) {
        const hay = [
          e.title, e.description, e.location, e.organiserName,
          e.postedBy.firstName, e.postedBy.surname,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, query, mode, from, to, dismissed]);

  const activeFilterCount = (mode !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);
  const clearFilters = () => { setMode("all"); setFrom(""); setTo(""); };

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  return (
    <>
      <div className="mb-4">
        <input
          type="search"
          aria-label="Search events"
          spellCheck={false}
          autoComplete="off"
          placeholder="Search events"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="text-[0.8rem] text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors flex items-center gap-1 py-2 -my-2"
          >
            <FilterIcon />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[0.65rem] bg-gold/15 text-gold-light border border-gold/25">
                {activeFilterCount}
              </span>
            )}
            <span className="ml-1 text-text-muted">{filtersOpen ? "▲" : "▼"}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[0.75rem] text-text-muted hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors"
            >
              Clear all
            </button>
          )}
          {/* Announced as filters change, so a screen-reader user hears the
              result count without having to go hunting for it. tabular-nums
              stops the row shifting as the digits change width. */}
          <span role="status" className="ml-auto text-[0.8rem] text-text-muted tabular-nums">
            {filtered.length} of {items.length}
            <span className="sr-only"> events shown</span>
          </span>
        </div>

        {filtersOpen && (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-5 space-y-5">
            <div>
              <div className="text-[0.75rem] text-text-muted mb-2">Location</div>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip label="All"        active={mode === "all"}       onClick={() => setMode("all")} />
                <FilterChip label="Online"     active={mode === "online"}    onClick={() => setMode("online")} />
                <FilterChip label="In-person"  active={mode === "in_person"} onClick={() => setMode("in_person")} />
              </div>
            </div>

            <div>
              <div className="text-[0.75rem] text-text-muted mb-2">Date range</div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  aria-label="Events from date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to || undefined}
                  className="px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary focus:border-gold/50"
                />
                <span className="text-text-muted text-[0.8rem]">to</span>
                <input
                  type="date"
                  aria-label="Events to date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  min={from || undefined}
                  className="px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary focus:border-gold/50"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {items.length === 0 ? "No upcoming events." : "No events match your search or filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((e) => <EventCard key={e.id} ev={e} going={goingSet.has(e.id)} onDismiss={() => dismiss(e.id)} />)}
        </div>
      )}
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${active ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"}`}
    >
      {label}
    </button>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function EventCard({ ev, going, onDismiss }: { ev: FoundryEvent; going: boolean; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const { checking, stale, check } = useListingFreshness("events", ev.id);
  const expandRecorded = useRef(false);

  useEffect(() => {
    if (!open) return;
    void check();
    if (!expandRecorded.current) {
      expandRecorded.current = true;
      recordListingEvent("event", ev.id, "expand");
    }
  }, [open, check, ev.id]);

  const dt = new Date(ev.eventAt);
  const dateLabel = formatDateWeekday(dt);
  const timeLabel = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const isOnline = ONLINE_RE.test(ev.location);

  return (
    <article
      className={`rounded-2xl bg-bg-card border overflow-hidden ${
        ev.isSocietyEvent ? "border-gold/45" : "border-border-subtle"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 text-left bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[0.75rem] text-gold-light tracking-wide">
            {timeLabel} <span className="text-text-muted">· {dateLabel}</span>
          </div>
          {ev.isSocietyEvent && (
            <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[0.7rem] font-semibold bg-gold text-bg-primary">
              Society event
            </span>
          )}
        </div>
        <div className="flex items-start gap-2 mb-3">
          <CalendarIcon />
          <h3 className="text-[1.05rem] font-medium text-text-primary leading-snug">
            {ev.title}
          </h3>
        </div>
        <div className="space-y-1.5">
          <Meta icon={<OrganiserAvatar name={ev.organiserName} />} text={`By ${ev.organiserName}`} />
          <Meta icon={isOnline ? <VideoIcon /> : <PinIcon />} text={ev.location} />
        </div>
        <div className="mt-3 text-[0.7rem] text-text-muted">
          {open ? "▾ Hide details" : "▸ Show details"}
        </div>
      </button>

      {open && stale && (
        <ListingGoneNotice kind="event" onDismiss={onDismiss} />
      )}

      {open && !stale && (
        <div className="px-5 pb-5 pt-1 border-t border-border-subtle">
          {checking && (
            <div className="text-[0.7rem] text-text-muted mt-3">Loading latest details…</div>
          )}
          <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1 mt-4">Description</div>
          <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">{ev.description}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 text-[0.8rem]">
            <div>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">Posted by</div>
              <div className="text-text-secondary">
                {ev.postedBy.firstName} {ev.postedBy.surname}
              </div>
              {ev.postedBy.linkedinUrl && (
                <a
                  href={ev.postedBy.linkedinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[0.75rem] text-gold no-underline hover:underline"
                >
                  LinkedIn ↗
                </a>
              )}
            </div>
            {ev.contactEmail && (
              <div>
                <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1">Contact organiser</div>
                <a
                  href={`mailto:${ev.contactEmail}?subject=${encodeURIComponent(ev.title)}`}
                  onClick={() => recordListingEvent("event", ev.id, "contact_click")}
                  className="text-[0.8rem] text-text-secondary no-underline hover:text-text-primary break-all"
                >
                  {ev.contactEmail}
                </a>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-start gap-2 flex-wrap">
            <a
              href={ev.lumaLink}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => recordListingEvent("event", ev.id, "external_click")}
              className="inline-block px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
            >
              RSVP on Luma ↗
            </a>
            <AddToCalendarMenu
              title={ev.title}
              description={ev.description}
              location={ev.location}
              startIso={ev.eventAt}
              url={ev.lumaLink}
            />
            <MarkActionPill kind="event" id={ev.id} initial={going} />
          </div>
        </div>
      )}
    </article>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-[0.8rem] text-text-secondary">
      <span className="shrink-0 text-text-muted">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function OrganiserAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold-muted text-gold-light text-[0.65rem] font-medium border border-gold/25">
      {initial}
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-gold-light mt-0.5 shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

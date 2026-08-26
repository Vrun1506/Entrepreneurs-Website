"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUrlFilters, useSearchDraft } from "@/lib/filters/useUrlFilters";
import { SearchInput } from "@/components/filters/FilterBar";
import { useListingFreshness } from "@/lib/useListingFreshness";
import { ListingGoneNotice } from "@/components/ListingGoneNotice";
import { MarkActionPill } from "@/components/MarkActionPill";
import { recordListingEvent } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { scrollBehavior } from "@/lib/motion";
import { toggleOpportunityBookmark } from "./actions";

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

export default function OpportunitiesClient({
  items, bookmarkedIds, appliedIds = [], removeOnUnbookmark = false,
}: {
  items: Opportunity[];
  bookmarkedIds: string[];
  /** Opportunity IDs the current user has self-marked as applied. */
  appliedIds?: string[];
  /** When true (used on /my-bookmarks), un-bookmarking a card also
   *  removes it from the visible list rather than just clearing the
   *  star — matches the user's intent on a bookmarks-only view. */
  removeOnUnbookmark?: boolean;
}) {
  // Client-side navigation: this page already holds every open role it can
  // show (list_approved_opportunities self-prunes past the deadline), so a
  // filter is a local operation and the URL is kept in step for free.
  const filters = useUrlFilters();
  const [query, setQuery] = useSearchDraft(filters);
  // Deep link from a profile's "Looking for" chip: /opportunities?o=<id>.
  // A query param, unlike the fragment it replaced, reaches the server — so
  // the card renders open in the first HTML rather than popping open after
  // hydration.
  const openId = filters.get("o");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set(bookmarkedIds));
  const appliedSet = useMemo(() => new Set(appliedIds), [appliedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = items.filter((o) => !dismissed.has(o.id));
    if (!q) return visible;
    return visible.filter((o) => {
      const hay = [
        o.positionName, o.company, o.pay, o.description,
        o.postedBy.firstName, o.postedBy.surname,
        o.locationText ?? "",
        ...o.skills, ...o.sectors,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, dismissed]);

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  const handleToggleBookmark = (id: string) => {
    // Optimistic update — flip the in-memory set, then call the server
    // and revert on failure.
    const wasBookmarked = bookmarks.has(id);
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(id); else next.add(id);
      return next;
    });
    if (wasBookmarked && removeOnUnbookmark) {
      setDismissed((prev) => new Set(prev).add(id));
    }
    void toggleOpportunityBookmark(id).then((res) => {
      if (!res.ok) {
        setBookmarks((prev) => {
          const next = new Set(prev);
          if (wasBookmarked) next.add(id); else next.delete(id);
          return next;
        });
        if (wasBookmarked && removeOnUnbookmark) {
          setDismissed((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    });
  };

  return (
    <>
      <SearchInput
        className="mb-8"
        label="Search opportunities"
        placeholder="Search by role, company, skill, sector, or poster"
        value={query}
        onChange={setQuery}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {items.length === 0 ? "No opportunities posted yet." : "No opportunities match your search."}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((o) => (
            <OpportunityCard
              key={o.id}
              opportunity={o}
              bookmarked={bookmarks.has(o.id)}
              applied={appliedSet.has(o.id)}
              defaultOpen={openId === o.id}
              onToggleBookmark={() => handleToggleBookmark(o.id)}
              onDismiss={() => dismiss(o.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function OpportunityCard({
  opportunity: o, bookmarked, applied, defaultOpen, onToggleBookmark, onDismiss,
}: {
  opportunity: Opportunity;
  bookmarked: boolean;
  applied: boolean;
  /** True when ?o= names this card. Server and client agree on it, so it is
   *  safe as an initial state — which the old #fragment check was not. */
  defaultOpen: boolean;
  onToggleBookmark: () => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { checking, stale, check } = useListingFreshness("opportunities", o.id);
  const expandRecorded = useRef(false);
  const articleRef = useRef<HTMLElement | null>(null);

  // The deep-linked card is already open in the markup; all that is left is
  // bringing it into view, which only the browser can do.
  useEffect(() => {
    if (defaultOpen) {
      articleRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }
  }, [defaultOpen]);

  useEffect(() => {
    if (!open) return;
    void check();
    if (!expandRecorded.current) {
      expandRecorded.current = true;
      recordListingEvent("opportunity", o.id, "expand");
    }
  }, [open, check, o.id]);

  const start = `${MONTHS[o.startMonth - 1]} ${o.startYear}`;
  const deadline = formatDate(o.applicationDeadline);
  const location =
    o.locationType === "remote"
      ? "Remote"
      : o.locationType === "hybrid"
      ? `Hybrid${o.locationText ? ` · ${o.locationText}` : ""}`
      : o.locationText || "Onsite";

  const toggleOpen = () => setOpen((v) => !v);

  return (
    <article ref={articleRef} id={`o-${o.id}`} className="rounded-2xl bg-bg-card border border-border-subtle overflow-hidden relative">
      {/* Bookmark button — sits outside the toggle area so clicks don't expand. */}
      <div className="absolute top-3 right-3 z-10">
        <BookmarkButton bookmarked={bookmarked} onClick={onToggleBookmark} />
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); }
        }}
        aria-expanded={open}
        className="w-full px-6 py-5 text-left bg-transparent cursor-pointer transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap pr-10">
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
      </div>

      {open && stale && (
        <ListingGoneNotice kind="opportunity" onDismiss={onDismiss} />
      )}

      {open && !stale && (
        <div className="px-6 pb-6 pt-1 border-t border-border-subtle">
          {checking && (
            <div className="text-[0.7rem] text-text-muted mt-3">Loading latest details…</div>
          )}
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
            <div className="flex items-start gap-2 flex-wrap">
              {o.applyMethod === "link" && o.applyUrl ? (
                <a
                  href={o.applyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => recordListingEvent("opportunity", o.id, "apply_click")}
                  className="inline-block px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
                >
                  Open application portal ↗
                </a>
              ) : o.contactEmail ? (
                <a
                  href={`mailto:${o.contactEmail}?subject=${encodeURIComponent(o.positionName)}`}
                  onClick={() => recordListingEvent("opportunity", o.id, "contact_click")}
                  className="inline-block px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
                >
                  Email to apply ↗
                </a>
              ) : (
                <p className="text-[0.8rem] text-text-secondary">
                  Contact <span className="text-text-primary">{o.postedBy.firstName} {o.postedBy.surname}</span> via LinkedIn to apply.
                </p>
              )}
              <MarkActionPill kind="opportunity" id={o.id} initial={applied} />
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function BookmarkButton({ bookmarked, onClick }: { bookmarked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this opportunity"}
      aria-pressed={bookmarked}
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-bg-card/80 backdrop-blur-sm border cursor-pointer transition-colors ${
        bookmarked
          ? "border-gold/50 text-gold hover:text-gold-light hover:border-gold"
          : "border-border text-text-muted hover:text-gold hover:border-gold/40"
      }`}
    >
      <svg
        width="15" height="15" viewBox="0 0 24 24"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

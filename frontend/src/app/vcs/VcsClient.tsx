"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useListingFreshness } from "@/lib/useListingFreshness";
import { ListingGoneNotice } from "@/components/ListingGoneNotice";
import { MarkActionPill } from "@/components/MarkActionPill";
import { recordListingEvent } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";

type Vc = {
  id: string;
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
  postedBy: { firstName: string; surname: string };
};

type KindFilter = "all" | "vc" | "grant";

export default function VcsClient({
  items, appliedIds = [],
}: {
  items: Vc[];
  /** VC/grant IDs the current user has self-marked as applied. */
  appliedIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<KindFilter>("all");
  const [from, setFrom] = useState<string>("");
  const [to,   setTo]   = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const appliedSet = useMemo(() => new Set(appliedIds), [appliedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs   = to   ? new Date(`${to}T23:59:59.999`).getTime() : null;
    const dateRangeActive = fromMs != null || toMs != null;
    const visible = items.filter((v) => !dismissed.has(v.id));
    return visible.filter((v) => {
      if (filter !== "all" && v.kind !== filter) return false;

      // If the user has constrained the deadline, rolling-application
      // VCs (deadline=null) don't match. Without a range set, all
      // listings stay visible.
      if (dateRangeActive) {
        if (!v.deadline) return false;
        const deadlineMs = new Date(v.deadline).getTime();
        if (fromMs != null && deadlineMs < fromMs) return false;
        if (toMs   != null && deadlineMs > toMs)   return false;
      }

      if (!q) return true;
      const hay = [v.name, v.description, v.amount ?? "", v.stage ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, filter, from, to, dismissed]);

  const activeFilterCount = (filter !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);
  const clearFilters = () => { setFilter("all"); setFrom(""); setTo(""); };

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  return (
    <>
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name, stage, or amount"
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
          <span className="ml-auto text-[0.8rem] text-text-muted">
            {filtered.length} of {items.length}
          </span>
        </div>

        {filtersOpen && (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-5 space-y-5">
            <div>
              <div className="text-[0.75rem] text-text-muted mb-2">Kind</div>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip label="All"    active={filter === "all"}   onClick={() => setFilter("all")} />
                <FilterChip label="VCs"    active={filter === "vc"}    onClick={() => setFilter("vc")} />
                <FilterChip label="Grants" active={filter === "grant"} onClick={() => setFilter("grant")} />
              </div>
            </div>

            <div>
              <div className="text-[0.75rem] text-text-muted mb-2">
                Deadline range
                <span className="text-text-muted/70"> — when set, rolling-application listings are hidden</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  max={to || undefined}
                  className="px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary focus:border-gold/50"
                />
                <span className="text-text-muted text-[0.8rem]">to</span>
                <input
                  type="date"
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
          {items.length === 0 ? "No listings yet." : "No listings match your search or filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => <VcCard key={v.id} vc={v} applied={appliedSet.has(v.id)} onDismiss={() => dismiss(v.id)} />)}
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

function VcCard({ vc: v, applied, onDismiss }: { vc: Vc; applied: boolean; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const { checking, stale, check } = useListingFreshness("vcs_grants", v.id);
  const expandRecorded = useRef(false);

  useEffect(() => {
    if (!open) return;
    void check();
    if (!expandRecorded.current) {
      expandRecorded.current = true;
      recordListingEvent("vc_grant", v.id, "expand");
    }
  }, [open, check, v.id]);

  const deadlineLabel = v.deadline
    ? formatDate(v.deadline)
    : null;
  const kindLabel = v.kind === "vc" ? "VC" : "Grant";

  return (
    <article className="rounded-2xl bg-bg-card border border-border-subtle overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 text-left bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="px-2 py-0.5 rounded-full text-[0.65rem] uppercase tracking-wider bg-gold-muted text-gold-light border border-gold/20">
            {kindLabel}
          </span>
          {deadlineLabel && (
            <span className="text-[0.7rem] text-text-muted">
              Deadline {deadlineLabel}
            </span>
          )}
        </div>
        <h3 className="text-[1.05rem] font-medium text-text-primary leading-snug mb-3">
          {v.name}
        </h3>
        <div className="space-y-1.5">
          <Meta icon={<PosterAvatar name={v.postedBy.firstName} />} text={`Posted by ${v.postedBy.firstName} ${v.postedBy.surname}`} />
          {(v.amount || v.stage) && (
            <Meta
              icon={<DollarIcon />}
              text={[v.amount, v.stage].filter(Boolean).join(" · ")}
            />
          )}
        </div>
        <div className="mt-3 text-[0.7rem] text-text-muted">
          {open ? "▾ Hide details" : "▸ Show details"}
        </div>
      </button>

      {open && stale && (
        <ListingGoneNotice kind="VC/grant" onDismiss={onDismiss} />
      )}

      {open && !stale && (
        <div className="px-5 pb-5 pt-1 border-t border-border-subtle">
          {checking && (
            <div className="text-[0.7rem] text-text-muted mt-3">Loading latest details…</div>
          )}
          <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1 mt-4">Description</div>
          <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">{v.description}</p>

          <div className="mt-5 flex items-start gap-2 flex-wrap">
            <a
              href={v.link}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => recordListingEvent("vc_grant", v.id, "external_click")}
              className="inline-block px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
            >
              Open link ↗
            </a>
            <MarkActionPill kind="vc_grant" id={v.id} initial={applied} />
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

function PosterAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold-muted text-gold-light text-[0.65rem] font-medium border border-gold/25">
      {initial}
    </span>
  );
}

function DollarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

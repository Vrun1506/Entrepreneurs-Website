"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUrlFilters, useSearchDraft } from "@/lib/filters/useUrlFilters";
import { SearchInput, FilterPanel, ChipChoice, RangeFilter } from "@/components/filters/FilterBar";
import { useListingFreshness } from "@/lib/useListingFreshness";
import { ListingGoneNotice } from "@/components/ListingGoneNotice";
import { FullPageLink } from "@/components/FullPageLink";
import { MarkActionPill } from "@/components/MarkActionPill";
import { recordListingEvent } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import type { Vc } from "@/lib/data/vcs";

const KINDS = [
  { value: "all",   label: "All" },
  { value: "vc",    label: "VCs" },
  { value: "grant", label: "Grants" },
] as const;

const KIND_VALUES = KINDS.map((k) => k.value);

export default function VcsClient({
  items, appliedIds = [],
}: {
  items: Vc[];
  /** VC/grant IDs the current user has self-marked as applied. */
  appliedIds?: string[];
}) {
  // Client-side navigation — see the note in EventsClient. The URL owns the
  // filters so a view is shareable; the filtering itself stays in the browser.
  const filters = useUrlFilters();
  const [query, setQuery] = useSearchDraft(filters);
  const filter = filters.getOne("kind", KIND_VALUES, "all");
  const from = filters.get("from");
  const to   = filters.get("to");
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

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));

  return (
    <>
      <SearchInput
        label="Search VCs and grants"
        placeholder="Search by name, stage, or amount"
        value={query}
        onChange={setQuery}
      />

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => filters.clear("kind", "from", "to")}
        resultCount={
          <>
            {filtered.length} of {items.length}
            <span className="sr-only"> listings shown</span>
          </>
        }
      >
        <ChipChoice
          label="Kind"
          options={KINDS}
          value={filter}
          onChange={(next) => filters.apply({ kind: next === "all" ? null : next })}
        />

        <RangeFilter
          label="Deadline range"
          hint=" — when set, rolling-application listings are hidden"
          type="date"
          from={from}
          to={to}
          fromLabel="Deadline from date"
          toLabel="Deadline to date"
          onFromChange={(v) => filters.apply({ from: v })}
          onToChange={(v) => filters.apply({ to: v })}
        />
      </FilterPanel>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-card px-6 py-14 text-center text-[0.85rem] text-text-muted">
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

function VcCard({ vc: v, applied, onDismiss }: {
  vc: Vc;
  applied: boolean;
  onDismiss: () => void;
}) {
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
    <article id={`v-${v.id}`} className="rounded-2xl bg-bg-card border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 text-left bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:bg-white/[0.02]"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="px-2 py-0.5 rounded-lg text-[0.65rem] uppercase tracking-wider bg-accent-muted text-accent-light border border-accent/20">
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
              className="inline-block px-4 py-2 rounded-lg bg-accent text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-accent-light"
            >
              Open link ↗
            </a>
            <MarkActionPill kind="vc_grant" id={v.id} initial={applied} />
            <FullPageLink href={`/vcs/${v.id}`} />
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
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent-muted text-accent-light text-[0.65rem] font-medium border border-accent/25">
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

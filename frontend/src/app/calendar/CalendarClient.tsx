"use client";

import { useEffect, useMemo, useState } from "react";

type ListingKind = "opportunity" | "event" | "vc_grant";
type Role = "applied" | "going" | "organising" | "posted";
type Status = "pending" | "approved";

export type MetaRow = { label: string; value: string; href?: string };

export type CalItem = {
  listingKind: ListingKind;
  listingId:   string;
  title:       string;
  subtitle:    string | null;
  occursAt:    string;
  role:        Role;
  status:      Status;
  description: string | null;
  meta:        MetaRow[];
};

type View = "list" | "month";

const KIND_DOT: Record<ListingKind, string> = {
  opportunity:  "bg-gold",
  event:        "bg-[#7fb3ff]",
  vc_grant:     "bg-[#b6e08b]",
};

const KIND_LABEL: Record<ListingKind, string> = {
  opportunity:  "Opportunity deadline",
  event:        "Event",
  vc_grant:     "VC / grant deadline",
};

const ROLE_LABEL: Record<Role, string> = {
  organising: "Organising",
  posted:     "Your listing",
  going:      "Going",
  applied:    "Applied",
};

export default function CalendarClient({ items }: { items: CalItem[] }) {
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<CalItem | null>(null);
  // Capture "now" once at mount so re-renders don't change the cutoff
  // and React's purity rule isn't violated by calling Date.now() in
  // the render body.
  const [now] = useState<number>(() => Date.now());

  const upcoming = useMemo(() => {
    return items
      .filter((i) => new Date(i.occursAt).getTime() >= now - 12 * 60 * 60 * 1000) // include today
      .sort((a, b) => new Date(a.occursAt).getTime() - new Date(b.occursAt).getTime());
  }, [items, now]);

  return (
    <>
      <div className="flex items-center gap-1.5 mb-6">
        <ViewTab label="List"  active={view === "list"}  onClick={() => setView("list")} />
        <ViewTab label="Month" active={view === "month"} onClick={() => setView("month")} />
        <span className="ml-auto text-[0.8rem] text-text-muted">
          {upcoming.length} upcoming
        </span>
      </div>

      <LegendRow />

      {upcoming.length === 0 ? (
        <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center text-[0.85rem] text-text-muted">
          Nothing upcoming. Items you post or mark as going/applied show up here automatically.
        </div>
      ) : view === "list" ? (
        <ListView items={upcoming} onSelect={setSelected} />
      ) : (
        <MonthView items={upcoming} onSelect={setSelected} />
      )}

      {selected && <DetailDialog item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors cursor-pointer ${
        active
          ? "bg-gold-muted border-gold/50 text-gold-light"
          : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

function LegendRow() {
  return (
    <div className="flex items-center gap-3 mb-4 text-[0.7rem] text-text-muted flex-wrap">
      <LegendDot kind="event"       label="Event" />
      <LegendDot kind="opportunity" label="Opportunity deadline" />
      <LegendDot kind="vc_grant"    label="VC / grant deadline" />
    </div>
  );
}

function LegendDot({ kind, label }: { kind: ListingKind; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${KIND_DOT[kind]}`} aria-hidden />
      {label}
    </span>
  );
}

// ─── List view ─────────────────────────────────────────────────────
function ListView({ items, onSelect }: { items: CalItem[]; onSelect: (i: CalItem) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const i of items) {
      const d = new Date(i.occursAt);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      const list = map.get(key) ?? [];
      list.push(i);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([dateKey, rows]) => ({ dateKey, rows }));
  }, [items]);

  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const d = new Date(`${g.dateKey}T00:00:00`);
        const dateLabel = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        return (
          <section key={g.dateKey}>
            <h2 className="text-[0.85rem] text-gold-light mb-2">{dateLabel}</h2>
            <div className="rounded-2xl bg-bg-card border border-border-subtle divide-y divide-border-subtle">
              {g.rows.map((r) => <ListRow key={`${r.listingKind}:${r.listingId}`} item={r} onSelect={onSelect} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListRow({ item, onSelect }: { item: CalItem; onSelect: (i: CalItem) => void }) {
  const d = new Date(item.occursAt);
  const timeLabel = item.listingKind === "event"
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "Deadline";
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="w-full flex items-start gap-3 p-4 text-left bg-transparent border-0 cursor-pointer transition-colors hover:bg-white/[0.02]"
    >
      <span className={`mt-1.5 shrink-0 inline-block w-2 h-2 rounded-full ${KIND_DOT[item.listingKind]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[0.7rem] text-text-muted">
          {timeLabel} <span className="opacity-60">· {KIND_LABEL[item.listingKind]}</span>
        </div>
        <div className="text-[0.9rem] text-text-primary mt-0.5">{item.title}</div>
        {item.subtitle && <div className="text-[0.75rem] text-text-muted mt-0.5">{item.subtitle}</div>}
      </div>
      <span className="shrink-0 flex items-center gap-1.5">
        {item.status === "pending" && (
          <span className="px-2 py-0.5 rounded-full text-[0.6rem] uppercase tracking-wider border border-border text-text-muted">
            In review
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full text-[0.65rem] tracking-wide border border-border-subtle text-text-muted">
          {ROLE_LABEL[item.role]}
        </span>
      </span>
    </button>
  );
}

// ─── Month view ────────────────────────────────────────────────────
// Renders the month containing the first upcoming item. Prev / next
// month nav stays inside the same client component — no router round-
// trips needed since the items array is already paginated client-side.
function MonthView({ items, onSelect }: { items: CalItem[]; onSelect: (i: CalItem) => void }) {
  const earliest = new Date(items[0].occursAt);
  const [cursor, setCursor] = useState(new Date(earliest.getFullYear(), earliest.getMonth(), 1));

  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const grid = useMemo(() => buildMonthGrid(cursor, items), [cursor, items]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="px-3 py-1.5 rounded-lg bg-transparent border border-border text-text-secondary text-[0.8rem] cursor-pointer hover:border-gold/40 hover:text-gold-light"
          aria-label="Previous month"
        >
          ◀
        </button>
        <div className="px-3 py-1.5 text-[0.9rem] text-text-primary">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="px-3 py-1.5 rounded-lg bg-transparent border border-border text-text-secondary text-[0.8rem] cursor-pointer hover:border-gold/40 hover:text-gold-light"
          aria-label="Next month"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border-subtle border border-border-subtle rounded-2xl overflow-hidden text-[0.7rem]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-2 bg-bg-card text-text-muted uppercase tracking-wider">{d}</div>
        ))}
        {grid.map((cell, idx) => (
          <div
            key={idx}
            className={`min-h-[88px] p-2 bg-bg-card ${cell.inMonth ? "" : "opacity-40"}`}
          >
            <div className="text-[0.7rem] text-text-muted mb-1">{cell.day}</div>
            <div className="space-y-1">
              {cell.items.map((i) => (
                <button
                  key={`${i.listingKind}:${i.listingId}`}
                  type="button"
                  onClick={() => onSelect(i)}
                  title={i.title}
                  className="w-full flex items-center gap-1.5 bg-transparent border-0 p-0 text-left cursor-pointer transition-colors hover:opacity-80"
                >
                  <span className={`shrink-0 inline-block w-1.5 h-1.5 rounded-full ${KIND_DOT[i.listingKind]}`} aria-hidden />
                  <span className="truncate text-[0.7rem] text-text-secondary">{i.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detail dialog ─────────────────────────────────────────────────
function DetailDialog({ item, onClose }: { item: CalItem; onClose: () => void }) {
  // Escape to close + lock background scroll while open.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const d = new Date(item.occursAt);
  const when = item.listingKind === "event"
    ? d.toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : `Deadline · ${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-[520px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-bg-card border border-border-subtle p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[0.7rem] text-text-muted">
              <span className={`inline-block w-2 h-2 rounded-full ${KIND_DOT[item.listingKind]}`} aria-hidden />
              {KIND_LABEL[item.listingKind]}
              <span className="opacity-50">·</span>
              <span>{ROLE_LABEL[item.role]}</span>
            </div>
            <h2 className="font-display text-text-primary text-[1.4rem] leading-tight mt-1">{item.title}</h2>
            {item.subtitle && <div className="text-[0.8rem] text-text-muted mt-1">{item.subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-lg bg-transparent border border-border text-text-muted cursor-pointer hover:text-text-primary hover:border-gold/40 transition-colors flex items-center justify-center text-lg leading-none"
          >
            ×
          </button>
        </div>

        {item.status === "pending" && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-gold/25 bg-gold/[0.06] text-[0.8rem] text-text-secondary leading-relaxed">
            <span className="text-gold-light font-medium">Still in review.</span> This listing is awaiting admin approval, so it doesn&apos;t have a public page yet. The details below are what you submitted.
          </div>
        )}

        <div className="text-[0.85rem] text-text-primary mb-4">{when}</div>

        {item.meta.length > 0 && (
          <dl className="space-y-2.5 mb-4">
            {item.meta.map((m) => (
              <div key={m.label} className="flex gap-3 text-[0.825rem]">
                <dt className="shrink-0 w-28 text-text-muted">{m.label}</dt>
                <dd className="min-w-0 flex-1 text-text-secondary break-words">
                  {m.href ? (
                    <a href={m.href} target="_blank" rel="noopener noreferrer" className="text-gold-light hover:underline break-all">{m.value}</a>
                  ) : (
                    m.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {item.description && (
          <div className="pt-3 border-t border-border-subtle">
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Description</div>
            <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-line">{item.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

type MonthCell = { day: number; inMonth: boolean; items: CalItem[] };

function buildMonthGrid(cursor: Date, items: CalItem[]): MonthCell[] {
  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // ISO week starts Monday. JS getDay: 0=Sun,...6=Sat. Convert to 0=Mon.
  const startWeekday = (first.getDay() + 6) % 7;

  // Items keyed by YYYY-MM-DD in local time.
  const byDate = new Map<string, CalItem[]>();
  for (const i of items) {
    const d = new Date(i.occursAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const list = byDate.get(key) ?? [];
    list.push(i);
    byDate.set(key, list);
  }

  const cells: MonthCell[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const d = new Date(year, month, -(startWeekday - 1 - i));
    cells.push({ day: d.getDate(), inMonth: false, items: [] });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${month}-${d}`;
    cells.push({ day: d, inMonth: true, items: byDate.get(key) ?? [] });
  }
  // Fill out to a multiple of 7.
  while (cells.length % 7 !== 0) {
    const day = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day, inMonth: false, items: [] });
  }
  return cells;
}

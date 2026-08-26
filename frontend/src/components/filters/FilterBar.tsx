"use client";

import { useId, useState, type ReactNode } from "react";

// ════════════════════════════════════════════════════════════════════
// The filter chrome shared by /community, /opportunities, /events,
// /vcs and /admin/community. It was pasted five times and had already
// drifted — one copy had lost its focus padding, another its
// aria-expanded — which is the usual argument for extracting it, plus a
// sharper one: these are the controls that write to the URL, and a
// filter that writes the wrong param name is a broken shareable link.
//
// Nothing here holds filter state. It renders values and reports
// changes; useUrlFilters owns the state, and the URL owns that.
// ════════════════════════════════════════════════════════════════════

const INPUT =
  "px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] " +
  "text-text-primary placeholder:text-text-muted transition-colors duration-150 " +
  "focus:border-gold/50 focus:bg-white/[0.05]";

const SMALL_INPUT =
  "px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] " +
  "text-text-primary placeholder:text-text-muted focus:border-gold/50";

export function SearchInput({
  label, placeholder, value, onChange, className = "mb-4",
}: {
  /** The accessible name. These boxes have no visible label. */
  label: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <input
        type="search"
        aria-label={label}
        spellCheck={false}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full ${INPUT}`}
      />
    </div>
  );
}

export function FilterPanel({
  activeCount, onClear, resultCount, children,
}: {
  activeCount: number;
  onClear: () => void;
  /** Rendered into a role="status" region — include an sr-only noun. */
  resultCount: ReactNode;
  children: ReactNode;
}) {
  // Open on arrival when filters are already applied. Someone opening a
  // shared link should see which filters produced the view, not an
  // unexplained subset behind a collapsed panel.
  const [open, setOpen] = useState(activeCount > 0);
  const panelId = useId();

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="text-[0.8rem] text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors flex items-center gap-1 py-2 -my-2"
        >
          <FilterIcon />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[0.65rem] bg-gold/15 text-gold-light border border-gold/25">
              {activeCount}
            </span>
          )}
          <span className="ml-1 text-text-muted" aria-hidden>{open ? "▲" : "▼"}</span>
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[0.75rem] text-text-muted hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors"
          >
            Clear all
          </button>
        )}

        {/* Announced as filters change, so a screen-reader user hears the
            result count without having to go hunting for it. tabular-nums
            stops the row shifting as the digits change width. */}
        <span role="status" className="ml-auto text-[0.8rem] text-text-muted tabular-nums">
          {resultCount}
        </span>
      </div>

      <div id={panelId} hidden={!open} className="rounded-2xl bg-bg-card border border-border-subtle p-5 space-y-5">
        {children}
      </div>
    </div>
  );
}

export function ChipGroup({
  label, options, selected, onToggle,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="text-[0.75rem] text-text-muted mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <FilterChip
            key={o.value}
            label={o.label}
            active={selected.has(o.value)}
            onClick={() => onToggle(o.value)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The single-choice variant: exactly one option is always active, so it
 * reports the chosen value rather than a toggle.
 */
export function ChipChoice<T extends string>({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <div className="text-[0.75rem] text-text-muted mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((o) => (
          <FilterChip
            key={o.value}
            label={o.label}
            active={value === o.value}
            onClick={() => onChange(o.value)}
          />
        ))}
      </div>
    </div>
  );
}

export function FilterChip({
  label, active, onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${
        active
          ? "bg-gold-muted border-gold/50 text-gold-light"
          : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

export function RangeFilter({
  label, hint, type, from, to, fromLabel, toLabel,
  fromPlaceholder, toPlaceholder, bounds, commitOn = "change", onFromChange, onToChange,
}: {
  label: string;
  hint?: ReactNode;
  type: "date" | "number";
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  /** Number ranges clamp to the data's real bounds; date ranges clamp to each other. */
  bounds?: { min: number; max: number };
  /**
   * "change" for client-side filtering, where a keystroke costs a rerender.
   * "blur" where it costs a database query.
   */
  commitOn?: "change" | "blur";
  onFromChange: (next: string) => void;
  onToChange: (next: string) => void;
}) {
  return (
    <div>
      <div className="text-[0.75rem] text-text-muted mb-2">
        {label}
        {hint && <span className="text-text-muted/70">{hint}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <RangeInput
          type={type}
          ariaLabel={fromLabel}
          placeholder={fromPlaceholder}
          value={from}
          commitOn={commitOn}
          min={bounds?.min}
          max={type === "date" ? (to || undefined) : bounds?.max}
          onCommit={onFromChange}
        />
        <span className="text-text-muted text-[0.8rem]">to</span>
        <RangeInput
          type={type}
          ariaLabel={toLabel}
          placeholder={toPlaceholder}
          value={to}
          commitOn={commitOn}
          min={type === "date" ? (from || undefined) : bounds?.min}
          max={bounds?.max}
          onCommit={onToChange}
        />
      </div>
    </div>
  );
}

function RangeInput({
  type, ariaLabel, placeholder, value, min, max, commitOn, onCommit,
}: {
  type: "date" | "number";
  ariaLabel: string;
  placeholder?: string;
  value: string;
  min?: number | string;
  max?: number | string;
  commitOn: "change" | "blur";
  onCommit: (next: string) => void;
}) {
  // Locally controlled so a blur-committed field still resets when the URL
  // value changes underneath it — which "Clear all" does, and which an
  // uncontrolled defaultValue would silently ignore.
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value);
  }

  return (
    <input
      type={type}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={draft}
      min={min}
      max={max}
      onChange={(e) => {
        setDraft(e.target.value);
        if (commitOn === "change") onCommit(e.target.value);
      }}
      onBlur={(e) => { if (commitOn === "blur") onCommit(e.target.value); }}
      className={`${type === "number" ? "w-[140px] " : ""}${SMALL_INPUT}`}
    />
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

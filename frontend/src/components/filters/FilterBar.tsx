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
  "px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.875rem] " +
  "text-text-primary placeholder:text-text-muted transition-colors duration-150 " +
  "focus:border-accent focus:bg-white/[0.05]";

const SMALL_INPUT =
  "px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] " +
  "text-text-primary placeholder:text-text-muted focus:border-accent";

// Field names above a control, matching the form kit.
const FILTER_LABEL = "text-[0.7rem] font-medium uppercase tracking-[0.14em] text-text-muted mb-2";

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
          className="flex items-center gap-1.5 px-3 py-2 text-[0.8rem] rounded-lg border border-border-strong bg-white/[0.04] text-text-secondary cursor-pointer transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          <FilterIcon />
          Filters
          {activeCount > 0 && (
            <span className="data ml-1 rounded-sm bg-accent px-1.5 py-0.5 text-[0.65rem] font-medium text-bg-primary">
              {activeCount}
            </span>
          )}
          <Chevron open={open} />
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-2 text-[0.75rem] rounded-lg border border-border-strong bg-white/[0.04] text-text-secondary cursor-pointer transition-colors duration-150 hover:border-accent hover:text-text-primary"
          >
            Clear all
          </button>
        )}

        {/* Announced as filters change, so a screen-reader user hears the
            result count without having to go hunting for it. tabular-nums
            stops the row shifting as the digits change width. */}
        <span role="status" className="ml-auto text-[0.8rem] text-text-secondary tabular-nums">
          {resultCount}
        </span>
      </div>

      <div
        id={panelId}
        hidden={!open}
        // The class is applied only while open, so React remounting the
        // attribute is what fires the animation. Left on permanently it
        // would run once, invisibly, behind `hidden`.
        className={`rounded-lg border border-border bg-bg-card p-5 space-y-5 ${open ? "anim-panel" : ""}`}
      >
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
      <div className={FILTER_LABEL}>{label}</div>
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
      <div className={FILTER_LABEL}>{label}</div>
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
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[0.775rem] transition-colors duration-150 ${
        active
          ? "border-accent bg-accent font-medium text-bg-primary"
          : "border-border-strong bg-white/[0.02] text-text-secondary hover:border-accent hover:text-text-primary"
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
      <div className={FILTER_LABEL}>
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal font-normal">{hint}</span>}
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

// A drawn chevron rather than the ▲ / ▼ characters this used to print. Those
// render at whatever size and baseline the user's emoji or symbol font
// decides, which is neither this type scale nor this stroke weight.
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className={`ml-0.5 text-text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

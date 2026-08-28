"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { inputCls, labelCls } from "@/components/forms/styles";

// ════════════════════════════════════════════════════════════════════
// Foundry · Intake controls
//
// The shared inputs the nine screens are built from. The rule running
// through all of them: anything you can press is drawn as a control — a
// surface and a border-strong outline — never as tinted text. That
// includes chip removals, file pickers and rank badges, which are the
// three places this app has historically shipped bare glyphs.
// ════════════════════════════════════════════════════════════════════

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={`${labelCls} mb-1.5`} htmlFor={htmlFor}>
        {label}
      </label>
      {hint && <p className="mb-2.5 text-[0.8rem] leading-[1.6] text-text-muted">{hint}</p>}
      {children}
    </div>
  );
}

/** A radio group drawn as cards. Used for affiliation and single-choice lists. */
export function ChoiceCards<T extends string>({
  name,
  options,
  value,
  onChange,
  columns = 2,
}: {
  name: string;
  options: { value: T; label: string; blurb?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: 1 | 2 | 3;
}) {
  const cols = columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div role="radiogroup" aria-label={name} className={`grid grid-cols-1 gap-2 ${cols}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors duration-150 ${
              on
                ? "border-accent bg-white/[0.10]"
                : "border-border-strong bg-white/[0.03] hover:border-accent hover:bg-white/[0.06]"
            }`}
          >
            <span
              className={`block text-[0.85rem] font-medium ${on ? "text-text-primary" : "text-text-secondary"}`}
            >
              {o.label}
            </span>
            {o.blurb && (
              <span className="mt-0.5 block text-[0.75rem] leading-[1.5] text-text-muted">{o.blurb}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Small pill row for single-choice short options (urgency, hours). */
export function PillChoice<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o)}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-[0.8rem] transition-colors duration-150 ${
              on
                ? "border-accent bg-accent font-medium text-bg-primary"
                : "border-border-strong bg-white/[0.03] text-text-secondary hover:border-accent hover:text-text-primary"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Open text input with suggestions. Anything typed is accepted — the
 * suggestion list is a shortcut, not a whitelist. A closed list would lose
 * exactly the people worth attracting: the postgrad whose real skill is
 * "microfluidic device fabrication" picks "hardware" and the signal is gone.
 */
export function TagInput({
  id,
  placeholder,
  suggestions,
  values,
  onAdd,
  onRemove,
  max,
}: {
  id?: string;
  placeholder: string;
  suggestions: string[];
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const atMax = max !== undefined && values.length >= max;

  const lower = values.map((v) => v.toLowerCase());
  const matches = draft.trim()
    ? suggestions
        .filter(
          (s) =>
            s.toLowerCase().includes(draft.trim().toLowerCase()) && !lower.includes(s.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  const commit = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v || atMax) return;
    if (lower.includes(v.toLowerCase())) {
      setDraft("");
      return;
    }
    onAdd(v);
    setDraft("");
  };

  return (
    <div>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v}>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-white/[0.06] py-1 pl-3 pr-1 text-[0.775rem] text-text-primary">
                {v}
                <button
                  type="button"
                  onClick={() => onRemove(v)}
                  aria-label={`Remove ${v}`}
                  className="ml-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-border-strong bg-white/[0.04] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                    <path
                      d="M1 1L8 8M8 1L1 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <input
        id={id}
        type="text"
        value={draft}
        disabled={atMax}
        list={listId}
        placeholder={atMax ? `That's the maximum (${max})` : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          }
          if (e.key === "Backspace" && !draft && values.length) onRemove(values[values.length - 1]);
        }}
        onBlur={() => commit(draft)}
        className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}
      />
      <datalist id={listId}>
        {matches.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      {matches.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onClick={() => commit(m)}
                className="cursor-pointer rounded-lg border border-border bg-white/[0.02] px-3 py-1.5 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
              >
                + {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * File picker. Drag-and-drop is an accelerant, never the only route — the
 * dashed area is a real button, and there is a labelled control inside it,
 * because a drop zone that only responds to a drag is invisible to anyone
 * on a phone or a keyboard.
 */
export function FilePicker({
  accept,
  label,
  hint,
  file,
  onPick,
  onClear,
  preview,
}: {
  accept: string;
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File) => void;
  onClear: () => void;
  preview?: string | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border-strong bg-white/[0.04] p-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL, not a remote asset
          <img
            src={preview}
            alt=""
            className="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.03] font-mono text-[0.65rem] text-text-secondary">
            {(file.name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.85rem] text-text-primary">{file.name}</span>
          <span className="block text-[0.75rem] text-text-muted">
            {(file.size / 1024).toFixed(0)} KB
          </span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.04] px-3 py-2 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          Replace
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onPick(f);
        }}
        className={`w-full cursor-pointer rounded-lg border border-dashed px-6 py-8 text-center transition-colors duration-150 ${
          over ? "border-accent bg-white/[0.08]" : "border-border-strong bg-white/[0.03] hover:bg-white/[0.06]"
        }`}
      >
        <span className="block text-[0.9rem] font-medium text-text-primary">{label}</span>
        <span className="mt-1 block text-[0.775rem] text-text-muted">{hint}</span>
        <span className="mt-4 inline-block rounded-lg border border-border-strong bg-white/[0.06] px-4 py-2 text-[0.8rem] text-text-primary">
          Choose a file
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Ordered multi-select. Rank is shown as a numbered badge, not by position alone. */
export function RankPicker({
  options,
  values,
  onToggle,
  max,
}: {
  options: readonly string[];
  values: string[];
  onToggle: (v: string) => void;
  max: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const rank = values.indexOf(o);
        const on = rank >= 0;
        const full = !on && values.length >= max;
        return (
          <button
            key={o}
            type="button"
            disabled={full}
            aria-pressed={on}
            onClick={() => onToggle(o)}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-[0.8rem] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
              on
                ? "border-accent bg-white/[0.10] text-text-primary"
                : "border-border-strong bg-white/[0.03] text-text-secondary hover:border-accent hover:text-text-primary"
            }`}
          >
            {on && (
              <span className="flex h-5 w-5 items-center justify-center rounded border border-signal/50 bg-signal-muted font-mono text-[0.65rem] text-signal">
                {rank + 1}
              </span>
            )}
            {o}
          </button>
        );
      })}
    </div>
  );
}

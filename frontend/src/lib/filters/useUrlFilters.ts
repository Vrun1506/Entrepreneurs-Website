"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// ════════════════════════════════════════════════════════════════════
// The query string is the single source of truth for every list filter.
//
// That buys three things no amount of local `useState` can: a filtered
// view is a URL you can send someone, the back button steps through
// filter history, and a reload lands you where you were.
//
// Two navigation modes, because the pages divide into two kinds:
//
//   "client"  — the browser already holds every row it can show, so a
//               filter is a local operation. Uses the History API, which
//               Next patches so `useSearchParams` observes it. No server
//               round trip, so the URL costs nothing to keep in step.
//
//   "server"  — the row set is too large to ship (the directory), so the
//               filter is an argument to a Postgres query. Uses
//               router.push inside a transition, and `pending` reports
//               the in-flight navigation so the UI can dim rather than
//               flash.
//
// A page moves between the two by changing one word here, which is the
// point: /community started as "client" and had to become "server" once
// the membership outgrew a single response.
// ════════════════════════════════════════════════════════════════════

/** `null`, `""` and `[]` all mean "drop this param" rather than "set it to empty". */
export type FilterValue = string | string[] | null;

/** Multi-value params travel comma-separated: ?skill=Python,Rust */
const LIST_SEPARATOR = ",";

export type UrlFilters = {
  /** A single-valued param, or "" when absent. */
  get(key: string): string;
  /** A single-valued param constrained to a known set, falling back when absent or unrecognised. */
  getOne<T extends string>(key: string, allowed: readonly T[], fallback: T): T;
  /** A multi-valued param as an array, empties stripped. */
  getList(key: string): string[];
  /** The same, as a Set — what the chip groups want. */
  getSet(key: string): Set<string>;
  /** Merge a patch into the query string and navigate. */
  apply(patch: Record<string, FilterValue>): void;
  /** Add or remove one value from a multi-valued param. */
  toggle(key: string, value: string): void;
  /** Drop the named params. */
  clear(...keys: string[]): void;
  /** True while a "server" navigation is in flight. Always false in "client" mode. */
  pending: boolean;
};

export function useUrlFilters({
  navigate = "client",
  resetKey = null,
}: {
  navigate?: "client" | "server";
  /**
   * A param dropped whenever any *other* param changes — in practice "page".
   * Staying on page 7 of a result set that now has two pages shows an empty
   * grid, so narrowing the filters has to return to the first page.
   */
  resetKey?: string | null;
} = {}): UrlFilters {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // Depend on the serialised form, not the object: Next hands back a fresh
  // ReadonlyURLSearchParams on some renders, and an unstable `apply` would
  // restart the debounce timer in useSearchDraft on every render.
  const qs = searchParams.toString();

  const apply = useCallback((patch: Record<string, FilterValue>) => {
    const params = new URLSearchParams(qs);
    let changedSomethingElse = false;

    for (const [key, value] of Object.entries(patch)) {
      const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
      if (empty) params.delete(key);
      else params.set(key, Array.isArray(value) ? value.join(LIST_SEPARATOR) : value);
      if (key !== resetKey) changedSomethingElse = true;
    }
    if (resetKey && changedSomethingElse) params.delete(resetKey);

    const url = params.size ? `${pathname}?${params}` : pathname;

    if (navigate === "server") {
      startTransition(() => router.push(url, { scroll: false }));
    } else {
      window.history.pushState(null, "", url);
    }
  }, [qs, pathname, navigate, resetKey, router]);

  const getList = useCallback(
    (key: string) =>
      (new URLSearchParams(qs).get(key) ?? "")
        .split(LIST_SEPARATOR)
        .map((s) => s.trim())
        .filter(Boolean),
    [qs],
  );

  const get = useCallback((key: string) => new URLSearchParams(qs).get(key) ?? "", [qs]);

  return {
    get,
    getList,
    getSet: useCallback((key: string) => new Set(getList(key)), [getList]),
    getOne: useCallback(
      <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
        const raw = new URLSearchParams(qs).get(key);
        return allowed.includes(raw as T) ? (raw as T) : fallback;
      },
      [qs],
    ),
    apply,
    toggle: useCallback((key: string, value: string) => {
      const current = getList(key);
      apply({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
    }, [getList, apply]),
    clear: useCallback((...keys: string[]) => {
      apply(Object.fromEntries(keys.map((k) => [k, null])));
    }, [apply]),
    pending,
  };
}

// ════════════════════════════════════════════════════════════════════
// Search boxes need a locally controlled value: typing must never be
// gated on anything, and writing a history entry per keystroke would
// make the back button useless.
//
// The draft leads, the URL follows on a pause. In "client" mode the list
// filters on the draft, so results keep up with the keystroke; in
// "server" mode they filter on the committed value, so they keep up with
// the debounce. Same hook either way.
// ════════════════════════════════════════════════════════════════════
export function useSearchDraft(
  filters: UrlFilters,
  key = "q",
  delayMs = 300,
): [string, (next: string) => void] {
  const committed = filters.get(key);
  const [draft, setDraft] = useState(committed);

  // Resync when the URL's value changes from somewhere other than this box
  // — the back button, or "Clear all". Adjusted during render rather than in
  // an effect, which is React's documented pattern for reacting to changed
  // input and avoids rendering one frame with the stale value.
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (lastCommitted !== committed) {
    setLastCommitted(committed);
    setDraft(committed);
  }

  const { apply } = filters;
  useEffect(() => {
    if (draft === committed) return;
    const timer = setTimeout(() => apply({ [key]: draft }), delayMs);
    return () => clearTimeout(timer);
  }, [draft, committed, apply, key, delayMs]);

  return [draft, setDraft];
}

"use client";

import type { UrlFilters } from "@/lib/filters/useUrlFilters";

/**
 * Previous/next pager for a server-filtered list.
 *
 * Every page that pages does so for the same reason — PostgREST caps a
 * response at max_rows and says nothing when it truncates — so they all
 * page the same way: `?page=` in the URL, a server navigation to change it.
 * Renders nothing when everything fits on one page.
 */
export function Pager({
  url, page, total, pageSize, label,
}: {
  url: UrlFilters;
  page: number;
  /** Rows matching the current filters, not rows overall. */
  total: number;
  pageSize: number;
  /** Names the landmark, e.g. "Member pages". */
  label: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const go = (next: number) => url.apply({ page: String(next) });

  return (
    <nav aria-label={label} className="mt-8 flex items-center justify-center gap-3">
      <button
        type="button"
        disabled={page <= 1 || url.pending}
        onClick={() => go(page - 1)}
        className={BUTTON}
      >
        ← Previous
      </button>
      <span className="text-[0.8rem] text-text-muted tabular-nums">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages || url.pending}
        onClick={() => go(page + 1)}
        className={BUTTON}
      >
        Next →
      </button>
    </nav>
  );
}

const BUTTON =
  "px-4 py-2 rounded-lg bg-transparent border border-border text-text-secondary " +
  "text-[0.8rem] cursor-pointer transition-colors hover:text-text-primary " +
  "hover:border-gold/40 disabled:opacity-40 disabled:cursor-not-allowed";

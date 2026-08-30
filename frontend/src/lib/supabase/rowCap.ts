import "server-only";
import * as Sentry from "@sentry/nextjs";

// ════════════════════════════════════════════════════════════════════
// Foundry · The row cap, made audible
//
// PostgREST truncates any response to `max_rows` and returns 200 with no
// error, no header and no flag. A list that has quietly lost rows looks
// exactly like a list that has not. That is the entire problem: the
// failure has no symptom until someone notices a member is missing.
//
// Two pages already hit it — the member directory and /admin/members —
// and both are fixed properly, by paging in Postgres (migrations
// 20260826000003 and ...004). This is for everything else: the lists that
// grow with submissions rather than with the member count, where paging
// today would be speculative but silence tomorrow would not be safe.
//
// Deliberately non-fatal, for the same reason instrumentation.ts warns
// rather than throws about missing abuse controls: a truncated list is
// bad, and a site that 500s because a list got long is worse. The point
// is that it stops being silent.
//
// When this fires, the fix is to page that query — not to raise max_rows.
// Raising it moves the cliff and keeps the silence.
// ════════════════════════════════════════════════════════════════════

/**
 * PostgREST's `db-max-rows`, mirrored from `supabase/config.toml`.
 *
 * If you change it there, change it here — a stale value here means the
 * check never fires, which is worse than not having it.
 */
export const MAX_ROWS = 1000;

/**
 * Reports when a query came back at exactly the row cap, and returns the
 * rows unchanged so it can wrap a result inline.
 *
 * `rows.length === MAX_ROWS` cannot distinguish "truncated" from "there
 * are exactly 1000" — but both mean the same thing here: this query is at
 * the ceiling and the next row added is lost.
 *
 * @param source Where to look. Use the query's own name, e.g.
 *               "list_approved_opportunities".
 */
export function reportIfCapped<T>(source: string, rows: T[]): T[] {
  if (rows.length >= MAX_ROWS) {
    const message =
      `${source} returned ${rows.length} rows, at PostgREST's ${MAX_ROWS}-row cap. ` +
      `Rows beyond the cap are being dropped silently. Page this query in Postgres.`;
    console.error(message);
    Sentry.captureMessage(message, { level: "error", tags: { rowCap: source } });
  }
  return rows;
}

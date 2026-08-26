import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { reportIfCapped, MAX_ROWS } from "./rowCap";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));

describe("reportIfCapped", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Sentry.captureMessage).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("passes the rows straight through", () => {
    const input = rows(3);
    expect(reportIfCapped("q", input)).toBe(input);
  });

  it("stays quiet below the cap", () => {
    reportIfCapped("q", rows(MAX_ROWS - 1));
    expect(console.error).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("reports at the cap, naming the query and how to fix it", () => {
    reportIfCapped("list_approved_events", rows(MAX_ROWS));

    expect(console.error).toHaveBeenCalledOnce();
    expect(Sentry.captureMessage).toHaveBeenCalledOnce();

    const [message, opts] = vi.mocked(Sentry.captureMessage).mock.calls[0];
    expect(message).toContain("list_approved_events");
    expect(message).toContain(String(MAX_ROWS));
    // The whole point is that the reader doesn't reach for the max_rows
    // setting, which hides the cause and moves the cliff.
    expect(message).toContain("Page this query in Postgres");
    expect(opts).toMatchObject({ level: "error", tags: { rowCap: "list_approved_events" } });
  });

  it("still reports the rows it did get, so a capped page renders", () => {
    const input = rows(MAX_ROWS);
    expect(reportIfCapped("q", input)).toHaveLength(MAX_ROWS);
  });

  // A truncated response is exactly `max_rows` long, but a caller that
  // slices or concatenates could hand over more. Treat over-cap as capped
  // rather than letting it fall through the equality check.
  it("reports above the cap too", () => {
    reportIfCapped("q", rows(MAX_ROWS + 5));
    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
  });

  it("mirrors the max_rows in supabase/config.toml", () => {
    expect(MAX_ROWS).toBe(1000);
  });
});

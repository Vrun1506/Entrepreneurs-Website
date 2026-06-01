import { describe, it, expect } from "vitest";
import { formatDate, formatDateWeekday, formatDateTime } from "./dates";

// Dates are constructed from local components (new Date(y, mIndex, d, ...)),
// so getDate/getMonth/getHours are timezone-stable regardless of the runner's
// TZ — the same wall-clock fields come back everywhere.

describe("formatDate", () => {
  it("renders '15 Sep 2026' from a local date", () => {
    expect(formatDate(new Date(2026, 8, 15))).toBe("15 Sep 2026");
  });

  it("uses the fixed 'Sep' month table (not ICU's 'Sept')", () => {
    expect(formatDate(new Date(2026, 8, 1))).toContain("Sep");
    expect(formatDate(new Date(2026, 8, 1))).not.toContain("Sept");
  });

  it("accepts an ISO string too", () => {
    // Date-only ISO parses as UTC midnight; assert the parts that don't shift.
    expect(formatDate("2026-09-15")).toContain("Sep 2026");
  });
});

describe("formatDateWeekday", () => {
  it("prefixes a weekday from the fixed table", () => {
    expect(formatDateWeekday(new Date(2026, 8, 15))).toMatch(
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), 15 Sep 2026$/,
    );
  });
});

describe("formatDateTime", () => {
  it("appends zero-padded HH:MM", () => {
    expect(formatDateTime(new Date(2026, 8, 15, 18, 5))).toMatch(/, 18:05$/);
    expect(formatDateTime(new Date(2026, 8, 15, 9, 0))).toMatch(/, 09:00$/);
  });
});

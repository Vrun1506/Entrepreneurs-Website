import { describe, it, expect } from "vitest";
import {
  GRAD_YEAR_FLOOR,
  STUDENT_HORIZON,
  gradYearOptions,
  validateGradYear,
} from "./gradYears";

const Y = 2026; // fixed "current year" so the tests don't drift with the clock

describe("gradYearOptions", () => {
  it("alum: floor up to the current year, newest first, no future years", () => {
    const opts = gradYearOptions("alum", Y);
    expect(opts[0]).toBe(Y);
    expect(opts.at(-1)).toBe(GRAD_YEAR_FLOOR);
    expect(opts).not.toContain(Y + 1);
    // strictly descending
    expect(opts).toEqual([...opts].sort((a, b) => b - a));
  });

  it("student: current year + 1 .. current year + horizon, no past/current years", () => {
    const opts = gradYearOptions("student", Y);
    expect(opts[0]).toBe(Y + STUDENT_HORIZON);
    expect(opts.at(-1)).toBe(Y + 1);
    expect(opts).not.toContain(Y);
  });
});

describe("validateGradYear", () => {
  it("alum: accepts current year and the floor, rejects future and below-floor", () => {
    expect(validateGradYear("alum", Y, Y)).toBeNull();
    expect(validateGradYear("alum", GRAD_YEAR_FLOOR, Y)).toBeNull();
    expect(validateGradYear("alum", Y + 1, Y)).not.toBeNull();
    expect(validateGradYear("alum", GRAD_YEAR_FLOOR - 1, Y)).not.toBeNull();
  });

  it("student: accepts current year + 1, rejects current year and beyond the horizon", () => {
    expect(validateGradYear("student", Y + 1, Y)).toBeNull();
    expect(validateGradYear("student", Y + STUDENT_HORIZON, Y)).toBeNull();
    expect(validateGradYear("student", Y, Y)).not.toBeNull();
    expect(validateGradYear("student", Y + STUDENT_HORIZON + 1, Y)).not.toBeNull();
  });

  it("rejects non-integers", () => {
    expect(validateGradYear("alum", NaN, Y)).not.toBeNull();
  });
});

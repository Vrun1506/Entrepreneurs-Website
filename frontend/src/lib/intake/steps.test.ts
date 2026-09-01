import { describe, it, expect } from "vitest";
import { ORDER, TOTAL_SCREENS, completeness, indexOf } from "./steps";

describe("intake step order", () => {
  it("puts youre-in right after face, before every other question", () => {
    expect(ORDER[0]).toBe("face");
    expect(ORDER[1]).toBe("youre-in");
    expect(ORDER.length).toBe(TOTAL_SCREENS);
  });

  it("has no duplicate or missing steps", () => {
    expect(new Set(ORDER).size).toBe(ORDER.length);
  });
});

describe("completeness", () => {
  it("is monotonically non-decreasing through the flow", () => {
    let prev = -1;
    for (const id of ORDER) {
      const pct = completeness(id);
      expect(pct).toBeGreaterThanOrEqual(prev);
      prev = pct;
    }
  });

  it("reports the same value for youre-in as for face — a result, not progress", () => {
    expect(completeness("youre-in")).toBe(completeness("face"));
  });

  it("reaches 100% on the last question screen", () => {
    const last = ORDER[ORDER.length - 1];
    expect(completeness(last)).toBe(100);
  });

  it("starts above 0% on the first screen", () => {
    expect(completeness(ORDER[0])).toBeGreaterThan(0);
  });

  it("indexOf and ORDER agree", () => {
    ORDER.forEach((id, i) => expect(indexOf(id)).toBe(i));
  });
});

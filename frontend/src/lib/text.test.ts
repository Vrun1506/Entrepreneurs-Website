import { describe, it, expect } from "vitest";
import { cleanText, cleanName, visibleLength } from "./text";

describe("cleanText", () => {
  it("returns '' for null/undefined", () => {
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
  });

  it("trims leading/trailing whitespace", () => {
    expect(cleanText("  hello  ")).toBe("hello");
  });

  it("strips zero-width characters", () => {
    expect(cleanText("a​b‍c")).toBe("abc");
  });

  it("NFC-normalises so composed and decomposed forms compare equal", () => {
    const decomposed = "café"; // e + combining acute
    expect(cleanText(decomposed)).toBe("café");
    expect(cleanText(decomposed)).toBe(cleanText("café"));
  });

  it("preserves internal whitespace", () => {
    expect(cleanText("de la  Cruz")).toBe("de la  Cruz");
  });
});

describe("cleanName", () => {
  it("collapses internal whitespace runs to a single space", () => {
    expect(cleanName("Jane   Doe")).toBe("Jane Doe");
  });

  it("still trims and strips like cleanText", () => {
    expect(cleanName("  Jane​  Doe  ")).toBe("Jane Doe");
  });
});

describe("visibleLength", () => {
  it("counts plain ASCII as its length", () => {
    expect(visibleLength("abc")).toBe(3);
  });

  it("counts a surrogate-pair emoji as 1, not 2", () => {
    expect(visibleLength("👍")).toBe(1);
    expect("👍".length).toBe(2); // sanity: raw .length over-counts
  });
});

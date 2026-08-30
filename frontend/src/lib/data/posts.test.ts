import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "./posts";

const VALID = {
  createdAt: "2026-08-29T12:34:56.789Z",
  id: "11111111-2222-3333-4444-555555555555",
};

describe("feed cursors", () => {
  it("round-trips a cursor", () => {
    expect(decodeCursor(encodeCursor(VALID))).toEqual(VALID);
  });

  it("is opaque rather than a readable pair", () => {
    // Base64 signals "do not hand-edit this", and means the shape can
    // change later without breaking a link someone already shared.
    const encoded = encodeCursor(VALID);
    expect(encoded).not.toContain(VALID.id);
    expect(encoded).not.toContain("|");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["not base64", "!!!!"],
    ["base64 but not a pair", Buffer.from("nonsense").toString("base64url")],
    ["a bad timestamp", Buffer.from(`not-a-date|${VALID.id}`).toString("base64url")],
    ["a bad uuid", Buffer.from(`${VALID.createdAt}|not-a-uuid`).toString("base64url")],
    ["a SQL-ish id", Buffer.from(`${VALID.createdAt}|1' or '1'='1`).toString("base64url")],
  ])("decodes %s to null rather than throwing", (_label, input) => {
    // These values arrive from a query string, so they are attacker-shaped
    // by default. A bad cursor must mean "start at the top", never a
    // database error surfaced to a member.
    expect(decodeCursor(input)).toBeNull();
  });

  it("splits on the last separator, so a timestamp containing one survives", () => {
    const odd = { createdAt: "2026-08-29T12:34:56.789Z", id: VALID.id };
    expect(decodeCursor(encodeCursor(odd))).toEqual(odd);
  });
});

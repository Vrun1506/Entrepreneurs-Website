import { describe, it, expect } from "vitest";
import { ok, err } from "./result";

describe("result", () => {
  it("ok() with no data is a bare success", () => {
    expect(ok()).toEqual({ ok: true });
  });

  it("ok(data) carries the payload", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
    expect(ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } });
  });

  it("ok(null) is a data success, not a bare one", () => {
    // null !== undefined, so it lands on the data branch.
    expect(ok(null)).toEqual({ ok: true, data: null });
  });

  it("err(message) is a failure carrying the error", () => {
    expect(err("nope")).toEqual({ ok: false, error: "nope" });
  });
});

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { collectFieldErrors, FORM_ERROR } from "./fields";

const schema = z
  .object({
    title: z.string().min(2, "Title is required."),
    count: z.number().int().min(1, "Need at least one."),
    kind:  z.enum(["a", "b"]),
  })
  .refine((v) => v.kind !== "a" || v.count > 5, { message: "A needs more than five." });

describe("collectFieldErrors", () => {
  it("returns the parsed data when everything passes", () => {
    const res = collectFieldErrors(schema, { title: "ok", count: 9, kind: "a" });
    expect(res).toEqual({ ok: true, data: { title: "ok", count: 9, kind: "a" } });
  });

  it("reports every failing field at once, not just the first", () => {
    const res = collectFieldErrors(schema, { title: "x", count: 0, kind: "b" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual({
      title: "Title is required.",
      count: "Need at least one.",
    });
  });

  it("keys by the first path segment so nested issues reach their field", () => {
    const nested = z.object({ outer: z.object({ inner: z.string().min(1, "Inner required.") }) });
    const res = collectFieldErrors(nested, { outer: { inner: "" } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual({ outer: "Inner required." });
  });

  it("puts pathless schema-level issues under FORM_ERROR", () => {
    const res = collectFieldErrors(schema, { title: "ok", count: 2, kind: "a" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual({ [FORM_ERROR]: "A needs more than five." });
  });

  it("keeps the first message per field when a field fails twice", () => {
    const twice = z.object({ v: z.string().min(3, "Too short.").regex(/^\d+$/, "Digits only.") });
    const res = collectFieldErrors(twice, { v: "ab" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors).toEqual({ v: "Too short." });
  });
});

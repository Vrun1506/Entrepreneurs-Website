import { describe, it, expect } from "vitest";
import { toVc } from "./vcs";

const row = {
  id: "v1",
  kind: "grant" as const,
  name: "Seed Fund",
  description: "Early cheques.",
  link: "https://seed.fund",
  amount: "£25k",
  deadline: "2026-10-01",
  stage: "pre-seed",
  posted_by: "u1",
  created_at: "2026-08-01T00:00:00Z",
  profiles: { first_name: "Ada", surname: "Lovelace" },
};

describe("toVc", () => {
  it("renames every field to camelCase and flattens the poster", () => {
    expect(toVc(row)).toEqual({
      id: "v1",
      kind: "grant",
      name: "Seed Fund",
      description: "Early cheques.",
      link: "https://seed.fund",
      amount: "£25k",
      deadline: "2026-10-01",
      stage: "pre-seed",
      postedBy: { firstName: "Ada", surname: "Lovelace" },
    });
  });

  // posted_by is a FK to profiles, and the embedded row comes back null if
  // the poster's profile is gone. Optional-chaining plus `?? ""` is what
  // stops that rendering as "undefined undefined" on the card.
  it("survives a poster whose profile row is missing", () => {
    expect(toVc({ ...row, profiles: null }).postedBy).toEqual({ firstName: "", surname: "" });
  });
});

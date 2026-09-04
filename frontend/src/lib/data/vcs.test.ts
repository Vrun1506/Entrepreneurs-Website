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
  poster_first_name: "Ada",
  poster_surname: "Lovelace",
};

describe("toVc", () => {
  // list_approved_vcs_grants inner-joins profiles (posted_by is `not null
  // references profiles(id) on delete restrict`), so unlike the old
  // embedded-relation select this row shape has no "poster missing" case
  // to survive — a row simply can't come back without one.
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
});

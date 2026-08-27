import { describe, it, expect } from "vitest";
import { toDirectoryMember } from "./directory";

const row = {
  id: "u1",
  first_name: "Ada",
  surname: "Lovelace",
  role: "alum" as const,
  course: "Computing",
  grad_year: 2024,
  bio: "Builds things.",
  working_on: "A compiler.",
  created_at: "2026-01-01T00:00:00Z",
  skill_names: ["Rust"],
  sector_names: ["Deeptech"],
  total_count: 12,
};

describe("toDirectoryMember", () => {
  it("renames to camelCase and carries the open roles through", () => {
    expect(toDirectoryMember(row, [{ id: "o1", role: "Founding engineer" }])).toEqual({
      id: "u1",
      firstName: "Ada",
      surname: "Lovelace",
      role: "alum",
      course: "Computing",
      gradYear: 2024,
      bioPreview: "Builds things.",
      workingOnPreview: "A compiler.",
      skills: ["Rust"],
      sectors: ["Deeptech"],
      lookingFor: [{ id: "o1", role: "Founding engineer" }],
    });
  });

  // The card maps over skills and sectors. A null from a member who has
  // picked none would throw where an empty array renders nothing.
  it("turns null tag arrays into empty ones", () => {
    const m = toDirectoryMember({ ...row, skill_names: null, sector_names: null }, []);
    expect(m.skills).toEqual([]);
    expect(m.sectors).toEqual([]);
  });

  it("does not put total_count on the member", () => {
    expect(toDirectoryMember(row, [])).not.toHaveProperty("total_count");
  });
});

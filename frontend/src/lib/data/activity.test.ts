import { describe, it, expect } from "vitest";
import { toActivityItem } from "./activity";

const row = {
  listing_kind: "event" as const,
  listing_id: "e1",
  action_type: "going" as const,
  marked_at: "2026-08-01T10:00:00Z",
  title: "Demo Night",
  subtitle: "Imperial",
  status: "approved",
  occurs_at: "2026-09-01T18:00:00Z",
  url: "https://lu.ma/x",
};

describe("toActivityItem", () => {
  it("renames every field to camelCase", () => {
    expect(toActivityItem(row)).toEqual({
      listingKind: "event",
      listingId: "e1",
      actionType: "going",
      markedAt: "2026-08-01T10:00:00Z",
      title: "Demo Night",
      subtitle: "Imperial",
      status: "approved",
      occursAt: "2026-09-01T18:00:00Z",
      url: "https://lu.ma/x",
    });
  });

  // /calendar filters on occursAt != null, so a null has to survive the
  // mapper as a null rather than becoming "" or undefined — an opportunity
  // whose deadline was cleared belongs on /my-activity and nowhere on a
  // calendar.
  it("keeps a missing date null rather than coercing it", () => {
    const item = toActivityItem({ ...row, occurs_at: null, subtitle: null, url: null });
    expect(item.occursAt).toBeNull();
    expect(item.subtitle).toBeNull();
    expect(item.url).toBeNull();
  });
});

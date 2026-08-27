import { describe, it, expect } from "vitest";
import { toEvent } from "./events";

const row = {
  id: "e1",
  title: "Demo Night",
  description: "Pitches.",
  luma_link: "https://lu.ma/x",
  event_at: "2026-09-01T18:00:00Z",
  location: "Imperial",
  organiser_name: "Foundry",
  contact_email: "hi@foundry.com",
  is_society_event: true,
  poster_first_name: "Ada",
  poster_surname: "Lovelace",
  poster_linkedin_url: null,
};

describe("toEvent", () => {
  it("renames every field to camelCase", () => {
    expect(toEvent(row)).toEqual({
      id: "e1",
      title: "Demo Night",
      description: "Pitches.",
      lumaLink: "https://lu.ma/x",
      eventAt: "2026-09-01T18:00:00Z",
      location: "Imperial",
      organiserName: "Foundry",
      contactEmail: "hi@foundry.com",
      isSocietyEvent: true,
      postedBy: { firstName: "Ada", surname: "Lovelace", linkedinUrl: null },
    });
  });

  it("falls back to empty strings for a missing poster name", () => {
    const out = toEvent({ ...row, poster_first_name: null, poster_surname: null });
    expect(out.postedBy).toEqual({ firstName: "", surname: "", linkedinUrl: null });
  });
});

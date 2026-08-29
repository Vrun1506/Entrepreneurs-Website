import { describe, it, expect } from "vitest";
import { startLabel, locationLabel } from "./format";

describe("startLabel", () => {
  it("renders the stored 1-12 month as a short name", () => {
    expect(startLabel({ startMonth: 1, startYear: 2027 })).toBe("Jan 2027");
    expect(startLabel({ startMonth: 12, startYear: 2026 })).toBe("Dec 2026");
  });

  // The month table lives in dates.ts precisely so this never comes from
  // the runtime's locale data: Node renders September as "Sept", browsers
  // as "Sep", and the card is server-rendered then hydrated.
  it("uses the same September the rest of the app does", () => {
    expect(startLabel({ startMonth: 9, startYear: 2026 })).toBe("Sep 2026");
  });
});

describe("locationLabel", () => {
  it("ignores the free-text location when the role is remote", () => {
    expect(locationLabel({ locationType: "remote", locationText: "London" })).toBe("Remote");
  });

  it("qualifies hybrid with the place, when there is one", () => {
    expect(locationLabel({ locationType: "hybrid", locationText: "London" })).toBe("Hybrid · London");
    expect(locationLabel({ locationType: "hybrid", locationText: null })).toBe("Hybrid");
  });

  // location_text is nullable and the form does not force it, so an onsite
  // role with nothing typed must still say something.
  it("falls back to Onsite when an onsite role names no place", () => {
    expect(locationLabel({ locationType: "onsite", locationText: "Imperial" })).toBe("Imperial");
    expect(locationLabel({ locationType: "onsite", locationText: null })).toBe("Onsite");
    expect(locationLabel({ locationType: "onsite", locationText: "" })).toBe("Onsite");
  });
});

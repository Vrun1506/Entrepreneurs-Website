import { formatMonthYearShort } from "@/lib/dates";
import type { Opportunity } from "@/lib/data/opportunities";

// Label formatting shared between an opportunity's card on /opportunities
// and its own page at /opportunities/[id]. Both render the same two
// derived strings, and they were written twice before the detail page
// existed — which is how /calendar ended up with a third, differently
// worded copy of the location rule.
//
// No "server-only" here on purpose: OpportunitiesClient is a client
// component. The Opportunity import is type-only, so nothing from the
// server-only data module survives into the bundle.

/** "Jan 2027", from the 1-12 month the row stores. */
export function startLabel(o: Pick<Opportunity, "startMonth" | "startYear">): string {
  return formatMonthYearShort(o.startYear, o.startMonth);
}

/** "Remote", "Hybrid · London", "Imperial College" — or "Onsite" if unsaid. */
export function locationLabel(o: Pick<Opportunity, "locationType" | "locationText">): string {
  if (o.locationType === "remote") return "Remote";
  if (o.locationType === "hybrid") return o.locationText ? `Hybrid · ${o.locationText}` : "Hybrid";
  return o.locationText || "Onsite";
}

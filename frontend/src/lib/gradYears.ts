import { NO_GRAD_YEAR, type Affiliation } from "@/lib/intake/steps";

// ════════════════════════════════════════════════════════════════════
// Role-aware graduation-year rules (client mirror of the RPC checks in
// 20260603000001_role_lock_and_grad_year_bounds.sql).
//
//   student                → still studying → current year + 1 .. + HORIZON
//   alum, recent_grad      → graduated      → FLOOR .. current year
//   mentor, angel, staff   → no graduation year at all
//
// The DB RPCs are the bypass-safe gate; these power the dropdown options
// and give a friendly inline error before the round trip.
// ════════════════════════════════════════════════════════════════════

// Widened when user_role went from two values to six (20260828000001).
// The rule is binary — are you still studying or not — so everything that
// is not a student falls into the graduated branch, and the three roles
// with no graduation year are filtered out by roleNeedsGradYear before
// they ever reach these.
export type GradRole = Affiliation;

/** mentor, angel and staff_faculty have no meaningful graduation year. */
export function roleNeedsGradYear(role: Affiliation): boolean {
  return !NO_GRAD_YEAR.includes(role);
}

// Earliest selectable year — the historical floor the dropdowns have
// always offered (well above the DB CHECK's 1950 absolute floor).
export const GRAD_YEAR_FLOOR = 1960;
// How far ahead a current student can project their graduation.
export const STUDENT_HORIZON = 6;

export function currentYear(): number {
  return new Date().getFullYear();
}

// Selectable years for the role, newest first.
export function gradYearOptions(role: GradRole, year: number = currentYear()): number[] {
  const out: number[] = [];
  if (role === "student") {
    for (let y = year + STUDENT_HORIZON; y >= year + 1; y--) out.push(y);
  } else {
    for (let y = year; y >= GRAD_YEAR_FLOOR; y--) out.push(y);
  }
  return out;
}

// Returns an error string for an invalid choice, or null when valid.
export function validateGradYear(role: GradRole, y: number, year: number = currentYear()): string | null {
  if (!Number.isInteger(y)) return "Please pick a valid graduation year.";
  if (role === "student") {
    if (y < year + 1) return `Students must pick an expected graduation year of ${year + 1} or later.`;
    if (y > year + STUDENT_HORIZON) return "Please pick a valid graduation year.";
  } else {
    if (y < GRAD_YEAR_FLOOR) return "Please pick a valid graduation year.";
    if (y > year) return "Graduates can't pick a future graduation year.";
  }
  return null;
}

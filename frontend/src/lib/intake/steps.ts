// ════════════════════════════════════════════════════════════════════
// Foundry · Intake step model
//
// The intake is nine screens in three groups. The grouping is the point:
// it tells a member, before they start, which questions are the door and
// which are optional depth. The old four-step form had no such signal, so
// every field looked equally mandatory.
//
// Screen numbering and group labels are the prototype's. "You're in" is
// deliberately unnumbered — it is a result, not a question, and giving it
// a number would imply there is something to fill in.
// ════════════════════════════════════════════════════════════════════

export type StepId =
  | "identity"
  | "face"
  | "youre-in"
  | "cv"
  | "skills"
  | "interests"
  | "where"
  | "want"
  | "refresh";

export type Step = {
  id: StepId;
  /** Sidebar number. null for screens that aren't a question. */
  num: string | null;
  /** Sidebar label — short. */
  label: string;
  /** Eyebrow above the heading, e.g. "GATE · 1 OF 2". */
  eyebrow: string;
  /** The screen's own heading. */
  title: string;
};

export type Group = {
  label: string;
  /** Shown under the group label in the rail. */
  note: string;
  steps: StepId[];
};

export const STEPS: Record<StepId, Step> = {
  identity: {
    id: "identity",
    num: "01",
    label: "Identity",
    eyebrow: "Gate · 1 of 2",
    title: "Who let you in?",
  },
  face: {
    id: "face",
    num: "02",
    label: "Face & bio",
    eyebrow: "Gate · 2 of 2",
    title: "Put a face to it",
  },
  "youre-in": {
    id: "youre-in",
    num: null,
    label: "You're in",
    eyebrow: "Gate complete",
    title: "You're in",
  },
  cv: {
    id: "cv",
    num: "03",
    label: "CV",
    eyebrow: "Unlock · Step 1 of 3",
    title: "Your CV, if you have one",
  },
  skills: {
    id: "skills",
    num: "04",
    label: "Skills",
    eyebrow: "Unlock · Step 2 of 3",
    title: "What are you actually good at?",
  },
  interests: {
    id: "interests",
    num: "05",
    label: "Interests",
    eyebrow: "Unlock · Step 3 of 3",
    title: "What you're into",
  },
  where: {
    id: "where",
    num: "06",
    label: "Where you're at",
    eyebrow: "Later · Step 1 of 3",
    title: "Where are you at?",
  },
  want: {
    id: "want",
    num: "07",
    label: "What you want",
    eyebrow: "Later · Step 2 of 3",
    title: "What do you want from this?",
  },
  refresh: {
    id: "refresh",
    num: "08",
    label: "Termly refresh",
    eyebrow: "Later · Step 3 of 3",
    title: "Still accurate?",
  },
};

export const GROUPS: Group[] = [
  {
    label: "The gate",
    note: "Nine fields. About a minute.",
    steps: ["identity", "face", "youre-in"],
  },
  {
    label: "Unlock your matches",
    note: "Behind the door. Costs you nothing.",
    steps: ["cv", "skills", "interests"],
  },
  {
    label: "Later, prompted",
    note: "We'll ask when it's useful.",
    steps: ["where", "want", "refresh"],
  },
];

/** Flat running order. */
export const ORDER: StepId[] = GROUPS.flatMap((g) => g.steps);

export const TOTAL_SCREENS = ORDER.length;

/** The last screen of the gate — everything after it is post-signup. */
export const GATE_END: StepId = "youre-in";

export const indexOf = (id: StepId): number => ORDER.indexOf(id);

/**
 * Profile completeness, as a percentage, for the progress bar.
 *
 * The gate is deliberately worth 40% on its own: the prototype's argument is
 * that a member who answers nine questions should see they have bought
 * something, and a bar that reads 22% after the hardest part of the flow
 * says the opposite. The remaining 60% is spread evenly over the six
 * optional screens.
 */
export function completeness(id: StepId): number {
  const i = indexOf(id);
  const gateEnd = indexOf(GATE_END);
  if (i <= gateEnd) return Math.round(((i + 1) / (gateEnd + 1)) * 40);
  const after = i - gateEnd;
  const remaining = TOTAL_SCREENS - 1 - gateEnd;
  return 40 + Math.round((after / remaining) * 60);
}

// ─── Affiliation ─────────────────────────────────────────────────────
// Six, per PRODUCT.md's six audiences. `student` and `alum` are the two
// values already in the user_role enum and carry live rows; the other four
// are added by migration before this can be submitted.
//
// Only `student` auto-approves, and only against a verified Imperial
// address. Every other value goes to the manual review queue — the mapping
// lives in submit_onboarding, not here.

export type Affiliation =
  | "student"
  | "recent_grad"
  | "alum"
  | "mentor"
  | "angel"
  | "staff_faculty";

export const AFFILIATIONS: { value: Affiliation; label: string; blurb: string }[] = [
  { value: "student", label: "Current student", blurb: "Undergrad, postgrad or PhD, building while you study." },
  { value: "recent_grad", label: "Recent graduate", blurb: "Within three years of graduating." },
  { value: "alum", label: "Alumni founder", blurb: "Imperial alum who has been through it." },
  { value: "mentor", label: "Mentor", blurb: "An operator or expert making time for the community." },
  { value: "angel", label: "Angel investor", blurb: "Looking at early-stage Imperial-connected startups." },
  { value: "staff_faculty", label: "Staff or faculty", blurb: "Researcher or professor bridging academia and startups." },
];

/**
 * Everyone who is not a current student.
 *
 * The two groups differ by how they get in, not by how they describe
 * themselves: a student is auto-approved off a verified Imperial address,
 * and every one of these five lands in pending_review for an admin (the
 * status map in migration 20260603000001). /login offers that split as its
 * two front doors and this list as the dropdown behind the second; /profile
 * offers it as the set a member may move between.
 */
export const NON_STUDENT_AFFILIATIONS = AFFILIATIONS.filter((a) => a.value !== "student");

/** Graduation year is meaningless for these three. */
export const NO_GRAD_YEAR: Affiliation[] = ["mentor", "angel", "staff_faculty"];

/** Whether this affiliation graduated already (past bound) or hasn't (future bound). */
export const HAS_GRADUATED: Affiliation[] = ["recent_grad", "alum"];

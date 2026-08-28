import type { Affiliation } from "./steps";

// ════════════════════════════════════════════════════════════════════
// Foundry · Intake form state
//
// One flat object rather than twelve useState calls, because the screens
// need to read each other's answers: screen 02 greets you by the name you
// gave in 01, and "You're in" matches on the course and skills you have
// already entered. Threading that through separate setters was the thing
// that made the old four-step form hard to extend.
//
// Fields marked NEW have no column in the live schema yet. They are
// captured and shown back, and the preview route does not pretend to
// persist them — see the note in IntakeFlow.
// ════════════════════════════════════════════════════════════════════

export type Skill = {
  name: string;
  /** Starred as one of at most three "core" skills. */
  core: boolean;
  /** True when it came from the lookup table rather than being typed fresh. */
  known: boolean;
};

export type IntakeState = {
  // 01 · Identity
  affiliation: Affiliation | null;
  email: string;
  fullName: string;
  preferredName: string; // NEW
  course: string;
  gradYear: string;

  // 02 · Face & bio
  photo: File | null; // NEW
  photoPreview: string | null; // NEW — object URL, revoked on replace
  bioFocus: string;
  bioHobbies: string; // NEW

  // 03 · CV
  cvFile: File | null; // NEW
  linkedin: string;

  // 04 · Skills
  skills: Skill[];

  // 05 · Interests
  sectorIds: number[];
  interests: string[]; // NEW
  hobbies: string[]; // NEW

  // 06 · Where you're at
  ventureStage: string; // NEW
  ventureOneLine: string; // NEW
  recruiting: string; // NEW

  // 07 · What you want
  wants: string[]; // NEW — ranked, max 3
  urgency: string; // NEW
  hoursPerWeek: string; // NEW

  // 08 · Termly refresh
  refreshConfirmed: boolean; // NEW
};

export const MAX_CORE_SKILLS = 3;
export const MIN_SKILLS = 3;
export const MAX_WANTS = 3;

export function initialState(seed: {
  email: string;
  firstName: string;
  surname: string;
  affiliation: Affiliation | null;
}): IntakeState {
  const full = [seed.firstName, seed.surname].filter(Boolean).join(" ");
  return {
    affiliation: seed.affiliation,
    email: seed.email,
    fullName: full,
    preferredName: seed.firstName ?? "",
    course: "",
    gradYear: "",

    photo: null,
    photoPreview: null,
    bioFocus: "",
    bioHobbies: "",

    cvFile: null,
    linkedin: "",

    skills: [],

    sectorIds: [],
    interests: [],
    hobbies: [],

    ventureStage: "",
    ventureOneLine: "",
    recruiting: "",

    wants: [],
    urgency: "",
    hoursPerWeek: "",

    refreshConfirmed: false,
  };
}

/** What we call them on screens 02 onward. Falls back rather than greeting a blank. */
export function addressAs(s: IntakeState): string {
  return s.preferredName.trim() || s.fullName.trim().split(" ")[0] || "there";
}

export const VENTURE_STAGES = [
  "Just an idea",
  "Validating it",
  "Building an MVP",
  "Launched, pre-revenue",
  "Revenue, growing",
  "Not building anything right now",
];

export const WANTS = [
  "A co-founder",
  "A first hire",
  "Intros to investors",
  "A mentor",
  "Technical help",
  "Customers to talk to",
  "Somewhere to start",
];

export const URGENCIES = ["Just browsing", "Next few months", "Actively looking now"];

export const HOURS = ["<5", "5–10", "10–20", "20+"];

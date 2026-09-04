import type { Affiliation } from "@/lib/intake/steps";

export type Mode = "signin" | "signup";
// Six values since 20260828000001. The split that matters on this page is
// not student-vs-alum but *which auth mechanic applies*: a student proves
// themselves with an Imperial address and an OTP code, and everybody else
// signs up with a password and waits for an admin. So the five non-student
// roles all ride the existing password flow, differing only in the `role`
// written into signup metadata.
export type Role = Affiliation | null;

// Which of the two flows the reader is in — the chooser's actual question.
// It is deliberately not the same thing as `role`: the chooser used to set
// role directly, which forced it to offer all six affiliations as equal
// cards just to reach two code paths. Now the door and the declaration are
// separate, so the door has two options and the declaration is a field.
//
// Staff and faculty are in "other" despite holding Imperial addresses. The
// address is not what separates the flows — admin review is. Only 'student'
// maps to 'approved' without a human (migration 20260603000001, asserted by
// supabase/tests/admission_roles.sql), so a "student or staff" door would
// promise instant access the database then refuses to give.
export type Track = "student" | "other";

// Seeded E2E identities + where their storage states live. Shared by
// global-setup (which creates them) and the specs (which assert as them).
// These only ever exist in the ephemeral CI Supabase, never prod.

export type Role = "student" | "admin";

export type SeedUser = {
  role: Role;
  email: string;
  password: string;
  firstName: string;
  surname: string;
  isAdmin: boolean;
};

// Student emails must be @imperial.ac.uk (the signup-domain trigger enforces it).
export const USERS: Record<Role, SeedUser> = {
  student: {
    role: "student",
    email: "e2e-student@imperial.ac.uk",
    password: "E2e-Student-Pw-123!",
    firstName: "Eve",
    surname: "Student",
    isAdmin: false,
  },
  admin: {
    role: "admin",
    email: "e2e-admin@imperial.ac.uk",
    password: "E2e-Admin-Pw-123!",
    firstName: "Ada",
    surname: "Admin",
    isAdmin: true,
  },
};

export const storageStatePath = (role: Role): string => `e2e/.auth/${role}.json`;

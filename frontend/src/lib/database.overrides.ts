import type { Database as Generated } from "./database.types";

// ════════════════════════════════════════════════════════════════════
// Corrections to the generated database types.
//
// `supabase gen types` emits every Postgres `text` parameter as a
// non-nullable `string`, because a function signature carries no
// nullability information — in Postgres every parameter is nullable and
// there is no way to say otherwise.
//
// For the optional profile fields that is not a cosmetic difference.
// The column CHECKs are of the form
//
//     check (bio is null or length(bio) between 1 and 1000)
//
// so an empty string is *rejected* where NULL is accepted. The forms
// therefore pass `cleanText(x) || null`, which is correct, and it is the
// generated type that has to be corrected rather than obeyed.
//
// Keep this file narrow and hand-maintained. database.types.ts is
// generated output and must never be edited — CI regenerates it and
// fails the build on any diff (see the rls-smoke job).
// ════════════════════════════════════════════════════════════════════

/** Widen the named keys of `T` to also accept null. */
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/** Optional free-text profile fields, nullable in the schema. */
type OptionalProfileText =
  | "p_bio"
  | "p_working_on"
  | "p_linkedin_url"
  | "p_github_url"
  | "p_portfolio_url";

type Fns = Generated["public"]["Functions"];

type PatchArgs<N extends keyof Fns, K extends keyof Fns[N]["Args"]> = Omit<Fns[N], "Args"> & {
  Args: Nullable<Fns[N]["Args"], K>;
};

type PatchedFns = Omit<Fns, "update_profile" | "submit_onboarding"> & {
  update_profile: PatchArgs<"update_profile", OptionalProfileText>;
  submit_onboarding: PatchArgs<"submit_onboarding", OptionalProfileText>;
};

export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Functions"> & { Functions: PatchedFns };
};

// Convenience aliases for the enums the app gates on, so they come from
// the schema rather than being hand-redeclared at each call site.
export type UserStatus = Generated["public"]["Enums"]["user_status"];
export type UserRole = Generated["public"]["Enums"]["user_role"];
export type ListingStatus = Generated["public"]["Enums"]["listing_status"];

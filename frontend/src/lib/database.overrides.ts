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
//     check (bio_focus is null or length(bio_focus) between 1 and 500)
//
// so an empty string is *rejected* where NULL is accepted. The forms
// therefore pass `cleanText(x) || null`, which is correct, and it is the
// generated type that has to be corrected rather than obeyed.
//
// Everything patched here was checked against the live schema first —
// information_schema for the columns, pg_get_function_arguments for the
// signatures. Nothing is widened just to silence a compiler error.
//
// Keep this file narrow and hand-maintained. database.types.ts is
// generated output and must never be edited — CI regenerates it and
// fails the build on any diff (see the rls-smoke job).
// ════════════════════════════════════════════════════════════════════

/** Widen the named keys of `T` to also accept null. */
type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/**
 * Optional links, shared by every RPC that collects them. `submit_onboarding`
 * shrank to just these five args (20260901000006) — it no longer has p_bio
 * or p_working_on at all, so patching it with a set that still names them
 * would add two properties to its Args type that don't exist on the real
 * function, not widen two that do.
 */
type OptionalContactText = "p_linkedin_url" | "p_github_url" | "p_portfolio_url";

/**
 * The rich profile fields intake writes. `update_profile` and
 * `submit_intake` both funnel into `_apply_intake_fields` under the hood
 * (20260901000006) and take an identical set of these — verified against
 * `pg_get_function_arguments` for each, not assumed from one.
 */
type OptionalIntakeText =
  | "p_preferred_name" | "p_bio_focus" | "p_bio_hobbies"
  | "p_current_focus" | "p_venture_stage" | "p_venture_name" | "p_venture_url"
  | "p_venture_one_liner" | "p_recruiting_status" | "p_intent_urgency"
  | "p_availability_hours";

/**
 * Optional listing fields. Verified against the live schema: every one of
 * these columns is nullable, and two of them *must* be null rather than
 * empty — opportunities_apply_consistency requires apply_url to be null
 * when apply_method is 'email'.
 */
type OptionalOpportunityText = "p_location_text" | "p_apply_url";
type OptionalVcGrantText = "p_amount" | "p_deadline" | "p_stage";

/**
 * `p_notes text DEFAULT NULL::text` on the approve RPCs. The generator turns
 * the default into `string | undefined` and stops there, but the parameter's
 * whole purpose is to be nullable — the admin actions pass an explicit null.
 */
type OptionalNotes = "p_notes";

type Fns = Generated["public"]["Functions"];

type PatchArgs<N extends keyof Fns, K extends keyof Fns[N]["Args"]> = Omit<Fns[N], "Args"> & {
  Args: Nullable<Fns[N]["Args"], K>;
};

type Patched =
  | "update_profile" | "submit_onboarding" | "submit_intake"
  | "submit_opportunity" | "admin_create_opportunity" | "update_opportunity"
  | "submit_vc_grant" | "admin_create_vc_grant" | "update_vc_grant"
  | "approve_opportunity" | "approve_event" | "approve_vc_grant" | "approve_user";

type PatchedFns = Omit<Fns, Patched> & {
  update_profile: PatchArgs<"update_profile", OptionalContactText | OptionalIntakeText>;
  submit_onboarding: PatchArgs<"submit_onboarding", OptionalContactText>;
  submit_intake: PatchArgs<"submit_intake", OptionalIntakeText>;

  submit_opportunity: PatchArgs<"submit_opportunity", OptionalOpportunityText>;
  admin_create_opportunity: PatchArgs<"admin_create_opportunity", OptionalOpportunityText>;
  update_opportunity: PatchArgs<"update_opportunity", OptionalOpportunityText>;

  submit_vc_grant: PatchArgs<"submit_vc_grant", OptionalVcGrantText>;
  admin_create_vc_grant: PatchArgs<"admin_create_vc_grant", OptionalVcGrantText>;
  update_vc_grant: PatchArgs<"update_vc_grant", OptionalVcGrantText>;

  approve_opportunity: PatchArgs<"approve_opportunity", OptionalNotes>;
  approve_event: PatchArgs<"approve_event", OptionalNotes>;
  approve_vc_grant: PatchArgs<"approve_vc_grant", OptionalNotes>;
  approve_user: PatchArgs<"approve_user", OptionalNotes>;
};

export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Functions"> & { Functions: PatchedFns };
};

// Convenience aliases for the enums the app gates on, so they come from
// the schema rather than being hand-redeclared at each call site.
export type UserStatus = Generated["public"]["Enums"]["user_status"];
export type UserRole = Generated["public"]["Enums"]["user_role"];
export type ListingStatus = Generated["public"]["Enums"]["listing_status"];

import { describe, it, expect } from "vitest";
import { describeSupabaseError } from "./supabaseErrors";

describe("describeSupabaseError", () => {
  it("handles null/undefined", () => {
    expect(describeSupabaseError(null)).toBe("Something went wrong.");
    expect(describeSupabaseError(undefined)).toBe("Something went wrong.");
  });

  it("passes a string through unchanged", () => {
    expect(describeSupabaseError("custom message")).toBe("custom message");
  });

  it("maps JWT/session errors (code + message sniff)", () => {
    expect(describeSupabaseError({ code: "PGRST301" })).toMatch(/session has expired/i);
    expect(describeSupabaseError({ message: "JWT expired" })).toMatch(/session has expired/i);
    expect(describeSupabaseError({ message: "invalid claim: bad" })).toMatch(/session has expired/i);
  });

  it("maps RLS denial (42501), preserving an explicit Forbidden message", () => {
    expect(describeSupabaseError({ code: "42501" })).toBe("You don't have permission to do that.");
    expect(describeSupabaseError({ code: "42501", message: "Forbidden: not yours" })).toBe(
      "Forbidden: not yours",
    );
  });

  it("maps unique-violation (23505), email-specific then generic", () => {
    expect(describeSupabaseError({ code: "23505", message: 'duplicate key "users_email_key"' })).toBe(
      "That email is already registered.",
    );
    expect(describeSupabaseError({ code: "23505", message: "duplicate key" })).toBe(
      "That value is already taken.",
    );
  });

  it("maps check-constraint (23514) by name, then falls back", () => {
    expect(
      describeSupabaseError({ code: "23514", message: 'violates check constraint "opportunities_description_len"' }),
    ).toBe("Description must be between 20 and 5000 characters.");
    expect(
      describeSupabaseError({ code: "23514", message: 'violates check constraint "unknown_constraint"' }),
    ).toMatch(/rejected by a validation rule/i);
  });

  it("maps the URL-length check constraints to 512-character messages", () => {
    expect(
      describeSupabaseError({ code: "23514", message: 'violates check constraint "profiles_linkedin_url_len"' }),
    ).toBe("LinkedIn URL must be 512 characters or fewer.");
    expect(
      describeSupabaseError({ code: "23514", message: 'violates check constraint "opportunities_apply_url_len"' }),
    ).toBe("Application portal URL must be 512 characters or fewer.");
    expect(
      describeSupabaseError({ code: "23514", message: 'violates check constraint "events_luma_link_len"' }),
    ).toBe("Luma link must be 512 characters or fewer.");
    expect(
      describeSupabaseError({ code: "23514", message: 'violates check constraint "vcs_grants_link_len"' }),
    ).toBe("Link must be 512 characters or fewer.");
  });

  it("maps FK violation (23503) and not-found (PGRST116)", () => {
    expect(describeSupabaseError({ code: "23503" })).toBe("That item no longer exists.");
    expect(describeSupabaseError({ code: "PGRST116" })).toBe("Not found.");
    expect(describeSupabaseError({ message: "no rows returned" })).toBe("Not found.");
  });

  it("maps network errors", () => {
    expect(describeSupabaseError({ message: "Failed to fetch" })).toMatch(/Network error/i);
  });

  it("falls back to the raw message on an unknown code", () => {
    expect(describeSupabaseError({ code: "99999", message: "weird thing" })).toBe("weird thing");
  });
});

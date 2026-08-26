import { flushSync } from "react-dom";
import type { z } from "zod";

// ════════════════════════════════════════════════════════════════════
// Running the server's schema in the browser.
//
// Every submission form used to re-implement its schema as a chain of
// if-statements: one error at a time, at the top of the form, away from
// the field that caused it. Worse, the two copies had already drifted —
// the client's contact-email regex (/^[^@]+@[^@]+\.[^@]+$/) accepted a
// space that the server's (/^[^@\s]+@[^@\s]+\.[^@\s]+$/) rejected, so a
// submission could pass the UI and be refused by the action.
//
// These helpers run the *same* schema client-side, so drift is not
// possible: there is one definition of every rule.
// ════════════════════════════════════════════════════════════════════

/** Message per field, keyed by the first segment of the Zod issue path. */
export type FieldErrors = Record<string, string>;

/** Issues with an empty path (schema-level .refine) land here. */
export const FORM_ERROR = "_form";

export function collectFieldErrors<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const res = schema.safeParse(input);
  if (res.success) return { ok: true, data: res.data };

  const errors: FieldErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : FORM_ERROR;
    // First issue wins: later ones for the same field are usually the
    // less specific of the two.
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/**
 * Renders the errors and moves focus to the first control they mark, so a
 * keyboard user lands on the thing they need to fix instead of hunting for
 * it. Focus targeting reads Field's data-invalid marker, so no call site
 * has to declare a name for itself.
 *
 * The two steps are one function on purpose: React batches state updates,
 * so a caller that set the errors and then looked for [data-invalid] would
 * query the DOM as it was *before* the errors rendered and focus nothing.
 * flushSync commits first.
 */
export function showFieldErrors(
  errors: FieldErrors,
  setErrors: (errors: FieldErrors) => void,
  form: HTMLElement | null,
): void {
  flushSync(() => setErrors(errors));
  form
    ?.querySelector<HTMLElement>("[data-invalid] input, [data-invalid] textarea, [data-invalid] select")
    ?.focus();
}

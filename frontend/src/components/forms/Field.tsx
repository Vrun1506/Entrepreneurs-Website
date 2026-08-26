import type { ReactNode } from "react";

// Label + control pair, with an optional inline error caption.
//
// The control is nested *inside* the <label> rather than pointed at by
// htmlFor. That gives implicit label association for free — every field
// in the app announces its name to a screen reader, and clicking the
// label text focuses the control — without every call site having to
// invent and thread an id. A <label> can only name one control, so a
// field holding several (a radio group) passes `group` and gets
// fieldset/legend instead — nesting labels is invalid and would leave the
// group unnamed.
//
// The error caption sits outside the <label> deliberately: text inside a
// label becomes part of the control's accessible *name*, which would make
// it read back as "Role title Role title is required". role="alert" gets
// it announced when it appears without polluting the name.
//
// data-invalid is what showFieldErrors() (lib/validation/fields) looks for,
// so forms can send focus to the first failing control without every call
// site having to name itself.
export function Field({
  label, required, hint, error, group, children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  /** Message to show beneath the control. Also marks the field invalid. */
  error?: string;
  /**
   * Set when the field holds several controls rather than one — a radio
   * group. Renders fieldset/legend instead, because a <label> can only name
   * one control, and wrapping several (each already in its own <label>)
   * nests labels, which is invalid and leaves the group unnamed.
   */
  group?: boolean;
  children: ReactNode;
}) {
  const caption = (
    <>
      {label} {required && <span className="text-[#ff6b6b]">*</span>}
      {hint && <span className="text-text-muted/70 ml-2">{hint}</span>}
    </>
  );

  if (group) {
    return (
      <fieldset data-invalid={error ? "" : undefined} className="min-w-0">
        <legend className="text-[0.75rem] text-text-muted mb-1.5">{caption}</legend>
        {children}
        <FieldError>{error}</FieldError>
      </fieldset>
    );
  }

  return (
    <div data-invalid={error ? "" : undefined}>
      <label className="block">
        <span className="block text-[0.75rem] text-text-muted mb-1.5">{caption}</span>
        {children}
      </label>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/**
 * The error caption on its own, for the handful of controls that sit
 * outside a Field (the contact-email and apply-link blocks, and the
 * contact form, which have their own bespoke layout). Wrap those in an
 * element carrying data-invalid so showFieldErrors() can still reach them.
 */
export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-[0.7rem] text-[#ff6b6b] leading-relaxed">
      {children}
    </p>
  );
}

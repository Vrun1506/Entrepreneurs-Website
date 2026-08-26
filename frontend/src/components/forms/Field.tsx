import type { ReactNode } from "react";

// Label + control pair.
//
// The control is nested *inside* the <label> rather than pointed at by
// htmlFor. That gives implicit label association for free — every field
// in the app announces its name to a screen reader, and clicking the
// label text focuses the control — without every call site having to
// invent and thread an id. It relies on there being exactly one
// labelable control per Field, which is how all 23 call sites use it.
export function Field({
  label, required, hint, children,
}: {
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="block text-[0.75rem] text-text-muted mb-1.5">
          {label} {required && <span className="text-[#ff6b6b]">*</span>}
          {hint && <span className="text-text-muted/70 ml-2">{hint}</span>}
        </span>
        {children}
      </label>
    </div>
  );
}

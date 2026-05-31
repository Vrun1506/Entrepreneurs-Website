import type { ReactNode } from "react";

export function Field({
  label, htmlFor, required, hint, children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[0.75rem] text-text-muted mb-1.5">
        {label} {required && <span className="text-[#ff6b6b]">*</span>}
        {hint && <span className="text-text-muted/70 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

// Both banners appear as the result of a submit, so they're announced.
// Errors use role="alert" (assertive — it interrupts, which is what you
// want when the thing you just tried failed); success uses role="status"
// (polite — it waits for a pause).

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="px-4 py-3 rounded-lg border-l-2 border-[#ff4d4d] bg-[#ff4d4d]/8 text-[0.8rem] text-[#ff8080] leading-relaxed"
    >
      {children}
    </div>
  );
}

export function SuccessBanner({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="px-4 py-3 rounded-lg border-l-2 border-accent bg-accent-muted text-[0.8rem] text-text-primary leading-relaxed"
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
      {children}
    </div>
  );
}

export function SuccessBanner({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-gold-muted border border-gold/30 text-[0.8rem] text-gold-light leading-relaxed">
      {children}
    </div>
  );
}

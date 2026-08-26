import Image from "next/image";

// Imperial Entrepreneurs logo + "Foundry" wordmark.
//
// Single source of truth for the brand mark across both the public
// marketing site and the authenticated app. Replaces the hexagon SVG
// that used to be inlined into AppNav, OnboardingForm, /pending,
// /rejected, /not-found, /login, and Footer.

type Size = "xs" | "sm" | "md";
const HEIGHT: Record<Size, string> = {
  xs: "h-6",  // 24px — footer
  sm: "h-7",  // 28px — app headers
  md: "h-9",  // 36px — marketing site
};
const WORDMARK_TEXT: Record<Size, string> = {
  xs: "text-[0.95rem]",
  sm: "text-[1.05rem]",
  md: "text-[1.1rem]",
};

export function BrandLogo({
  size = "sm",
  showWordmark = true,
  showAffiliation = false,
  priority = false,
}: {
  size?: Size;
  showWordmark?: boolean;
  /** Append "Imperial College London" after the wordmark. Used in the footer. */
  showAffiliation?: boolean;
  /**
   * Preload the mark. Opt-in, because this renders in the footer of every page
   * as well as the header — `priority` there preloaded a below-the-fold image
   * and competed with LCP. Set it only where the logo is above the fold.
   */
  priority?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/entrepreneurs-logo.png"
        alt="Imperial Entrepreneurs"
        width={4832}
        height={2540}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className={`${HEIGHT[size]} w-auto`}
        style={{ mixBlendMode: "screen" }}
      />
      {showWordmark && (
        <span className={`font-display ${WORDMARK_TEXT[size]} text-text-primary tracking-tight border-l border-border/60 pl-3`}>
          Foundry
        </span>
      )}
      {showAffiliation && (
        <span className="text-[0.75rem] text-text-muted">Imperial College London</span>
      )}
    </div>
  );
}

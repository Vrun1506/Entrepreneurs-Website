import type { ButtonHTMLAttributes, ReactNode } from "react";

// ════════════════════════════════════════════════════════════════════
// Foundry · Button
//
// One implementation of the four button treatments the app actually
// uses. Before this, the ~200-character class string below was pasted
// into 13 form submits and every admin review card, and had already
// drifted between them.
//
// Two things it fixes beyond deduplication:
//
//   * `transition-all` (the old class) animates *every* animatable
//     property, including `outline-color` — which meant the global
//     focus ring faded in rather than appearing. The explicit property
//     list here leaves `outline` alone.
//   * A loading button used to render nothing but a decorative <div>,
//     so it had no accessible name at all while submitting. The label
//     is now kept in the DOM (visually hidden) alongside `aria-busy`.
// ════════════════════════════════════════════════════════════════════

type Variant = "primary" | "ghost" | "dangerGhost" | "danger";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center cursor-pointer " +
  "transition-[color,background-color,border-color,transform,opacity] duration-200 " +
  // Unified across every variant. The old copies were split between
  // 50% (admin) and 60% (forms) with no reason behind the difference.
  "disabled:opacity-60 disabled:cursor-not-allowed";

const VARIANT: Record<Variant, string> = {
  primary:     "bg-gold text-bg-primary font-medium hover:bg-gold-light",
  ghost:       "bg-transparent border border-border text-text-muted hover:text-text-primary",
  // "Reject" — reads as neutral until you're about to press it.
  dangerGhost: "bg-transparent border border-border text-text-secondary hover:text-[#ff6b6b] hover:border-[#ff4d4d]/30",
  danger:      "bg-[#ff4d4d]/15 border border-[#ff4d4d]/30 text-[#ff6b6b] font-medium hover:bg-[#ff4d4d]/25",
};

// The hover lift belongs to the two large sizes only: it reads as
// deliberate on a full-width form submit and as jitter on a row of
// small admin actions sitting side by side.
const SIZE: Record<Size, string> = {
  sm: "px-4 py-2 rounded-lg text-[0.8rem]",
  md: "px-6 py-3 rounded-xl text-[0.85rem] tracking-wide hover:-translate-y-px disabled:hover:translate-y-0",
  lg: "px-6 py-3.5 rounded-xl text-[0.9rem] tracking-wide hover:-translate-y-px disabled:hover:translate-y-0",
};

export function Button({
  variant = "primary",
  size = "lg",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  /** Swaps the label for a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {loading ? (
        <>
          {/* currentColor so the spinner works on a gold fill and on the
              transparent variants alike. globals.css slows rather than
              freezes this under prefers-reduced-motion. */}
          <span
            className="w-[18px] h-[18px] border-2 border-current/30 border-t-current rounded-full animate-spin"
            aria-hidden
          />
          <span className="sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

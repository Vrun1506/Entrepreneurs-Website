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
  "transition-[color,background-color,border-color,opacity] duration-150 " +
  // Unified across every variant. The old copies were split between
  // 50% (admin) and 60% (forms) with no reason behind the difference.
  "disabled:opacity-60 disabled:cursor-not-allowed";

const VARIANT: Record<Variant, string> = {
  // The logo has exactly two values, ink and field. The highest-emphasis
  // control on the page is that same pairing, which is why this is a white
  // fill and not a coloured one.
  primary:     "bg-accent text-bg-primary font-semibold hover:bg-accent-dim",
  // The two neutral variants used to be fully transparent with a --color-border
  // outline and a --color-text-muted label: 1.36:1 for the outline and 2.76:1
  // for the text against the page. Both were below the point where they read as
  // a control at all — the complaint was "it's not obvious that it's a button",
  // and it was accurate. They now carry a surface as well as an outline, which
  // is what actually separates a button from a line of text.
  ghost:       "bg-white/[0.05] border border-border-strong text-text-primary hover:bg-white/[0.10] hover:border-accent",
  // "Reject" — still reads as neutral until you're about to press it. The
  // restraint was always in the label colour, not in the invisible border, so
  // only the border changed here.
  dangerGhost: "bg-white/[0.05] border border-border-strong text-text-secondary hover:bg-[#ff4d4d]/10 hover:text-[#ff8080] hover:border-[#ff4d4d]/60",
  danger:      "bg-[#ff4d4d]/15 border border-[#ff4d4d]/40 text-[#ff8080] font-medium hover:bg-[#ff4d4d]/25",
};

// Sizes differ in padding and label size only.
//
// The two large sizes used to carry `hover:-translate-y-px`. It is gone: a
// button that lifts off the page was the one motion tic this app repeated on
// every surface, and it is the wrong instinct in a system drawn with a
// straight edge. Hover emphasis is now a contrast change, which is also the
// feedback a reduced-motion user actually receives.
const SIZE: Record<Size, string> = {
  sm: "px-4 py-2 rounded-lg text-[0.8rem]",
  md: "px-6 py-3 rounded-lg text-[0.85rem]",
  lg: "px-6 py-3.5 rounded-lg text-[0.9rem]",
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
          {/* currentColor so the spinner works on a accent fill and on the
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

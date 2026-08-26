// A CSS `scroll-behavior: auto` override does NOT stop an imperative
// `scrollIntoView({ behavior: "smooth" })` or `scrollTo({ behavior: "smooth" })` —
// the option passed in JS wins over the computed style. So the reduced-motion
// block in globals.css can't cover the handful of scripted scrolls, and they
// have to ask at the call site instead.

/** Resolves to "auto" when the user has asked for reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

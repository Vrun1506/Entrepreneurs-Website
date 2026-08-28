// Shared form styling constants. Imported by Field, FormInput, etc., and
// by any form that still renders its own inputs inline.
//
// The focus state moves the border to the full accent rather than a 50%
// tint. The global :focus-visible ring only fires for keyboard focus, so on
// a mouse click the border was the entire focus feedback — and a half-opacity
// border against a card is not a state change you can see.
export const inputCls =
  "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] " +
  "text-text-primary placeholder:text-text-muted transition-colors duration-150 " +
  "focus:border-accent focus:bg-white/[0.05]";

// Field names, column heads, the caption above a value. The wordmark's second
// register — light, tracked out, uppercase — doing the job a datasheet gives
// it. Short labels only; this is unreadable on a sentence.
export const labelCls =
  "block text-[0.7rem] font-medium uppercase tracking-[0.14em] text-text-secondary";

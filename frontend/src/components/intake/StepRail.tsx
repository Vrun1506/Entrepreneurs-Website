"use client";

import { GROUPS, STEPS, indexOf, type StepId } from "@/lib/intake/steps";
import { labelCls } from "@/components/forms/styles";

// ════════════════════════════════════════════════════════════════════
// Foundry · Intake step rail
//
// The rail's job is to show that the flow is finite and grouped, so the
// gate reads as short rather than as the first three of nine unknowns.
//
// Only visited steps are pressable, and they are drawn as controls —
// surface plus a border-strong outline — rather than as tinted text. A
// step you can return to and a step you cannot must not look the same.
// ════════════════════════════════════════════════════════════════════

export default function StepRail({
  current,
  furthest,
  onJump,
}: {
  current: StepId;
  /** The deepest screen reached so far; anything past it is not navigable. */
  furthest: StepId;
  onJump: (id: StepId) => void;
}) {
  const currentIdx = indexOf(current);
  const furthestIdx = indexOf(furthest);

  return (
    <nav aria-label="Intake progress" className="w-full">
      {GROUPS.map((group) => (
        <div key={group.label} className="mb-8 last:mb-0">
          <p className={`${labelCls} mb-1`}>{group.label}</p>
          <p className="mb-3 text-[0.75rem] leading-[1.5] text-text-muted">{group.note}</p>

          <ul className="space-y-1">
            {group.steps.map((id) => {
              const step = STEPS[id];
              const idx = indexOf(id);
              const isCurrent = idx === currentIdx;
              const isDone = idx < currentIdx;
              const reachable = idx <= furthestIdx && !isCurrent;

              const numCls = isDone
                ? "text-signal"
                : isCurrent
                  ? "text-text-primary"
                  : "text-text-muted";

              const inner = (
                <span className="flex items-center gap-3">
                  <span className={`w-5 shrink-0 font-mono text-[0.7rem] ${numCls}`}>
                    {step.num ?? "—"}
                  </span>
                  <span className="truncate">{step.label}</span>
                </span>
              );

              if (isCurrent) {
                return (
                  <li key={id}>
                    <div
                      aria-current="step"
                      className="rounded-lg border border-border-strong bg-white/[0.06] px-3 py-2 text-[0.8rem] font-medium text-text-primary"
                    >
                      {inner}
                    </div>
                  </li>
                );
              }

              return (
                <li key={id}>
                  {reachable ? (
                    <button
                      type="button"
                      onClick={() => onJump(id)}
                      className="w-full cursor-pointer rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-left text-[0.8rem] text-text-secondary transition-colors duration-150 hover:border-border-strong hover:bg-white/[0.05] hover:text-text-primary"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="rounded-lg border border-transparent px-3 py-2 text-[0.8rem] text-text-muted">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

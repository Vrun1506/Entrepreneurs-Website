import type { ReactNode } from "react";
import { labelCls } from "./styles";

export type ChipItem = { id: number; name: string };

export function ChipGroup({
  label, items, selected, onToggle, hint = "optional, pick any that fit",
}: {
  label: ReactNode;
  items: ChipItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  hint?: ReactNode;
}) {
  return (
    <div>
      <div className={`${labelCls} mb-2`}>
        {label}{hint && <span className="ml-2 normal-case tracking-normal font-normal text-text-muted">— {hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`px-3 py-1.5 rounded-lg text-[0.775rem] border transition-colors duration-150 cursor-pointer ${
                on
                  ? "bg-accent text-bg-primary border-accent font-medium"
                  : "bg-white/[0.02] border-border-strong text-text-secondary hover:border-accent hover:text-text-primary"
              }`}
            >
              {it.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

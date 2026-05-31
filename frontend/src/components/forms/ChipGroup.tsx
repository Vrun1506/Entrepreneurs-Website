import type { ReactNode } from "react";

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
      <div className="block text-[0.75rem] text-text-muted mb-2">
        {label} {hint && <span className="text-text-muted/70">— {hint}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${
                on
                  ? "bg-gold-muted border-gold/50 text-gold-light"
                  : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"
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

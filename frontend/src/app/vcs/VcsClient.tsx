"use client";

import { useMemo, useState } from "react";

type Vc = {
  id: string;
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
  postedBy: { firstName: string; surname: string };
};

export default function VcsClient({ items }: { items: Vc[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "vc" | "grant">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((v) => {
      if (filter !== "all" && v.kind !== filter) return false;
      if (!q) return true;
      const hay = [v.name, v.description, v.amount ?? "", v.stage ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, filter]);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by name, stage, or amount"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[260px] px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />
        <div className="flex gap-2">
          <FilterChip label="All"     active={filter === "all"}   onClick={() => setFilter("all")} />
          <FilterChip label="VCs"     active={filter === "vc"}    onClick={() => setFilter("vc")} />
          <FilterChip label="Grants"  active={filter === "grant"} onClick={() => setFilter("grant")} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {items.length === 0 ? "No listings yet." : "No listings match your search."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => <VcCard key={v.id} vc={v} />)}
        </div>
      )}
    </>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${active ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"}`}
    >
      {label}
    </button>
  );
}

function VcCard({ vc: v }: { vc: Vc }) {
  const deadline = v.deadline
    ? new Date(v.deadline).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <article className="p-5 rounded-2xl bg-bg-card border border-border-subtle">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[0.95rem] font-medium text-text-primary">{v.name}</div>
        <span className="px-2 py-0.5 rounded-full text-[0.65rem] bg-gold-muted text-gold-light border border-gold/20 uppercase tracking-wider">
          {v.kind === "vc" ? "VC" : "Grant"}
        </span>
      </div>
      <p className="text-[0.8rem] text-text-secondary leading-relaxed mb-3 line-clamp-4">{v.description}</p>

      <div className="text-[0.75rem] text-text-muted space-y-0.5 mb-3">
        {v.amount   && <div><span className="text-text-secondary">Amount:</span> {v.amount}</div>}
        {v.stage    && <div><span className="text-text-secondary">Stage:</span> {v.stage}</div>}
        {deadline   && <div><span className="text-text-secondary">Deadline:</span> {deadline}</div>}
      </div>

      <a
        href={v.link}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-block px-3 py-1.5 rounded-lg bg-gold text-bg-primary text-[0.775rem] font-medium no-underline transition-colors hover:bg-gold-light"
      >
        Open link ↗
      </a>
    </article>
  );
}

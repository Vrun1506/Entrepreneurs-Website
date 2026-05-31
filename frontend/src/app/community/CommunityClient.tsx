"use client";

import { useEffect, useMemo, useState } from "react";
import SocialLinks from "@/components/SocialLinks";
import SearchableMultiSelect from "@/components/forms/SearchableMultiSelect";

type Member = {
  id: string;
  firstName: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  gradYear: number | null;
  bio: string | null;
  workingOn: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  skills: string[];
  sectors: string[];
};

export default function CommunityClient({
  members, newest,
}: {
  members: Member[];
  newest: Member[];
}) {
  const [query, setQuery] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<"alum" | "student">>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [gradYearMin, setGradYearMin] = useState<string>("");
  const [gradYearMax, setGradYearMax] = useState<string>("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openMember, setOpenMember] = useState<Member | null>(null);

  // Derive the available chips from what members actually have, sorted
  // alphabetically. Avoids the chip row showing options that match
  // nobody.
  const { availableCourses, availableSectors, availableSkills, gradYearBounds } = useMemo(() => {
    const courses = new Set<string>();
    const sectors = new Set<string>();
    const skills  = new Set<string>();
    let minY = Infinity, maxY = -Infinity;
    for (const m of members) {
      if (m.course && m.course.trim().length > 0) courses.add(m.course);
      m.sectors.forEach((s) => sectors.add(s));
      m.skills.forEach((s) => skills.add(s));
      if (m.gradYear != null) {
        if (m.gradYear < minY) minY = m.gradYear;
        if (m.gradYear > maxY) maxY = m.gradYear;
      }
    }
    return {
      availableCourses: [...courses].sort((a, b) => a.localeCompare(b)),
      availableSectors: [...sectors].sort((a, b) => a.localeCompare(b)),
      availableSkills:  [...skills].sort((a, b) => a.localeCompare(b)),
      gradYearBounds:   Number.isFinite(minY) ? { min: minY, max: maxY } : null,
    };
  }, [members]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minY = gradYearMin ? parseInt(gradYearMin, 10) : null;
    const maxY = gradYearMax ? parseInt(gradYearMax, 10) : null;
    return members.filter((m) => {
      if (selectedRoles.size > 0 && !selectedRoles.has(m.role)) return false;
      if (selectedCourses.size > 0 && (!m.course || !selectedCourses.has(m.course))) return false;
      if (selectedSectors.size > 0 && !m.sectors.some((s) => selectedSectors.has(s))) return false;
      if (selectedSkills.size  > 0 && !m.skills.some((s)  => selectedSkills.has(s)))  return false;
      if (minY != null && (m.gradYear == null || m.gradYear < minY)) return false;
      if (maxY != null && (m.gradYear == null || m.gradYear > maxY)) return false;
      if (q) {
        const hay = [
          m.firstName, m.surname, `${m.firstName} ${m.surname}`,
          m.course ?? "", m.bio ?? "", m.workingOn ?? "",
          ...m.skills, ...m.sectors,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, query, selectedRoles, selectedCourses, selectedSectors, selectedSkills, gradYearMin, gradYearMax]);

  const activeFilterCount =
    selectedRoles.size + selectedCourses.size + selectedSectors.size + selectedSkills.size +
    (gradYearMin ? 1 : 0) + (gradYearMax ? 1 : 0);

  const clearFilters = () => {
    setSelectedRoles(new Set());
    setSelectedCourses(new Set());
    setSelectedSectors(new Set());
    setSelectedSkills(new Set());
    setGradYearMin("");
    setGradYearMax("");
  };

  return (
    <>
      {newest.length > 0 && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-text-primary text-[1.25rem] tracking-tight">
              Some of our newest members…
            </h2>
            <span className="text-[0.7rem] text-text-muted">{newest.length} just joined</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {newest.map((m) => <NewestCard key={m.id} member={m} onClick={() => setOpenMember(m)} />)}
          </div>
        </section>
      )}

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name, course, skill, sector, or what they're working on"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="text-[0.8rem] text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors flex items-center gap-1 py-2 -my-2"
          >
            <FilterIcon />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[0.65rem] bg-gold/15 text-gold-light border border-gold/25">
                {activeFilterCount}
              </span>
            )}
            <span className="ml-1 text-text-muted">{filtersOpen ? "▲" : "▼"}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[0.75rem] text-text-muted hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors"
            >
              Clear all
            </button>
          )}
          <span className="ml-auto text-[0.8rem] text-text-muted">
            {filtered.length} of {members.length}
          </span>
        </div>

        {filtersOpen && (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-5 space-y-5">
            <FilterGroup
              label="Role"
              options={[
                { value: "student", label: "Students" },
                { value: "alum",    label: "Alumni" },
              ]}
              selected={selectedRoles}
              onToggle={(v) => toggleSet(selectedRoles, v as "alum" | "student", setSelectedRoles)}
            />

            {availableCourses.length > 0 && (
              <SearchableMultiSelect
                label="Course"
                options={availableCourses}
                selected={selectedCourses}
                onChange={setSelectedCourses}
                placeholder="Filter by course — search or pick"
                emptyText="No course matches that search."
              />
            )}

            {availableSectors.length > 0 && (
              <FilterGroup
                label="Sectors"
                options={availableSectors.map((s) => ({ value: s, label: s }))}
                selected={selectedSectors}
                onToggle={(v) => toggleSet(selectedSectors, v, setSelectedSectors)}
              />
            )}

            {availableSkills.length > 0 && (
              <FilterGroup
                label="Skills"
                options={availableSkills.map((s) => ({ value: s, label: s }))}
                selected={selectedSkills}
                onToggle={(v) => toggleSet(selectedSkills, v, setSelectedSkills)}
              />
            )}

            {gradYearBounds && (
              <div>
                <div className="text-[0.75rem] text-text-muted mb-2">
                  Graduation year <span className="text-text-muted/70">— range {gradYearBounds.min}–{gradYearBounds.max}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder={`From ${gradYearBounds.min}`}
                    value={gradYearMin}
                    onChange={(e) => setGradYearMin(e.target.value)}
                    min={gradYearBounds.min}
                    max={gradYearBounds.max}
                    className="w-[140px] px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary placeholder:text-text-muted outline-none focus:border-gold/50"
                  />
                  <span className="text-text-muted text-[0.8rem]">to</span>
                  <input
                    type="number"
                    placeholder={`To ${gradYearBounds.max}`}
                    value={gradYearMax}
                    onChange={(e) => setGradYearMax(e.target.value)}
                    min={gradYearBounds.min}
                    max={gradYearBounds.max}
                    className="w-[140px] px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary placeholder:text-text-muted outline-none focus:border-gold/50"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-[0.85rem]">
          {members.length === 0 ? "No members yet." : "No members match your search or filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => <MemberCard key={m.id} member={m} onClick={() => setOpenMember(m)} />)}
        </div>
      )}

      {openMember && (
        <MemberDialog member={openMember} onClose={() => setOpenMember(null)} />
      )}
    </>
  );
}

function toggleSet<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  setter(next);
}

function FilterGroup<T extends string>({
  label, options, selected, onToggle,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-[0.75rem] text-text-muted mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onToggle(o.value)}
              className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${
                on
                  ? "bg-gold-muted border-gold/50 text-gold-light"
                  : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function NewestCard({ member: m, onClick }: { member: Member; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-4 rounded-2xl bg-gold-muted/30 border border-gold/20 hover:border-gold/50 hover:bg-gold-muted/40 transition-colors duration-150 cursor-pointer"
    >
      <div className="text-[0.875rem] font-medium text-text-primary truncate">
        {m.firstName} {m.surname}
      </div>
      <div className="text-[0.7rem] text-text-muted mt-0.5 truncate">
        {memberSubtitle(m)}
      </div>
      {m.course && (
        <div className="mt-2 text-[0.7rem] text-gold-light line-clamp-2">{m.course}</div>
      )}
    </button>
  );
}

function MemberCard({ member: m, onClick }: { member: Member; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full p-5 rounded-2xl bg-bg-card border border-border-subtle hover:border-gold/40 hover:bg-bg-card/80 transition-colors duration-150 cursor-pointer group"
    >
      <header className="mb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[0.95rem] font-medium text-text-primary truncate">
              {m.firstName} {m.surname}
            </div>
            <div className="text-[0.725rem] text-text-muted mt-0.5">
              {memberSubtitle(m)}
            </div>
            {m.course && (
              <div className="text-[0.725rem] text-text-secondary mt-1 truncate">{m.course}</div>
            )}
          </div>
          <span className="text-text-muted/60 group-hover:text-gold transition-colors text-[0.8rem] mt-1">→</span>
        </div>
      </header>

      {m.bio && (
        <p className="text-[0.8rem] text-text-secondary leading-relaxed mt-3 line-clamp-2">
          {m.bio}
        </p>
      )}

      {m.workingOn && (
        <div className="text-[0.75rem] text-text-muted mt-2 leading-relaxed line-clamp-1">
          <span className="text-gold/80">Working on:</span> {m.workingOn}
        </div>
      )}
    </button>
  );
}

function MemberDialog({ member: m, onClose }: { member: Member; onClose: () => void }) {
  // Esc closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Profile of ${m.firstName} ${m.surname}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[600px] rounded-2xl bg-bg-card border border-border-subtle shadow-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 px-7 pt-6 pb-4 border-b border-border-subtle">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.4rem] text-text-primary tracking-tight truncate">
              {m.firstName} {m.surname}
            </h2>
            <div className="text-[0.75rem] text-text-muted mt-1">{memberSubtitle(m)}</div>
            {m.course && (
              <div className="text-[0.8rem] text-text-secondary mt-1">{m.course}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer border-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-7 py-5 space-y-5">
          {m.bio && (
            <section>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1.5">Bio</div>
              <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">{m.bio}</p>
            </section>
          )}

          {m.workingOn && (
            <section>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1.5">Working on</div>
              <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">{m.workingOn}</p>
            </section>
          )}

          {m.sectors.length > 0 && (
            <section>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Interests</div>
              <div className="flex flex-wrap gap-1.5">
                {m.sectors.map((s) => (
                  <span key={`sec-${s}`} className="px-2.5 py-1 rounded-full text-[0.725rem] bg-gold-muted text-gold-light border border-gold/20">
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {m.skills.length > 0 && (
            <section>
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Skills &amp; expertise</div>
              <div className="flex flex-wrap gap-1.5">
                {m.skills.map((s) => (
                  <span key={`skl-${s}`} className="px-2.5 py-1 rounded-full text-[0.725rem] bg-white/[0.03] text-text-secondary border border-border">
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {(m.linkedinUrl || m.githubUrl || m.portfolioUrl) && (
            <section className="pt-3 border-t border-border-subtle">
              <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Links</div>
              <SocialLinks linkedinUrl={m.linkedinUrl} githubUrl={m.githubUrl} portfolioUrl={m.portfolioUrl} />
            </section>
          )}

          {!m.bio && !m.workingOn && m.sectors.length === 0 && m.skills.length === 0
            && !m.linkedinUrl && !m.githubUrl && !m.portfolioUrl && (
            <p className="text-[0.85rem] text-text-muted italic">
              No additional details on this profile yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function memberSubtitle(m: Member) {
  if (m.role === "alum") return `Alum · ${m.gradYear ?? "—"}`;
  return m.gradYear ? `Student · class of ${m.gradYear}` : "Imperial student";
}

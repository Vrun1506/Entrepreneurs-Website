"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import SearchableMultiSelect from "@/components/forms/SearchableMultiSelect";
import { adminDeleteUser } from "./actions";

type Status = "pending_onboarding" | "pending_review" | "approved" | "rejected";
type Role   = "alum" | "student";

type Member = {
  id: string;
  firstName: string;
  surname: string;
  role: Role;
  status: Status;
  course: string | null;
  gradYear: number | null;
  email: string | null;
  createdAt: string;
  skills: string[];
  sectors: string[];
};

const STATUS_LABEL: Record<Status, string> = {
  pending_onboarding: "Onboarding",
  pending_review:     "Awaiting review",
  approved:           "Approved",
  rejected:           "Rejected",
};

export default function CommunityAdminClient({ members }: { members: Member[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedRoles,    setSelectedRoles]    = useState<Set<Role>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(new Set());
  const [selectedCourses,  setSelectedCourses]  = useState<Set<string>>(new Set());
  const [selectedSectors,  setSelectedSectors]  = useState<Set<string>>(new Set());
  const [selectedSkills,   setSelectedSkills]   = useState<Set<string>>(new Set());
  const [gradYearMin,      setGradYearMin]      = useState<string>("");
  const [gradYearMax,      setGradYearMax]      = useState<string>("");

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
      if (selectedRoles.size    > 0 && !selectedRoles.has(m.role))       return false;
      if (selectedStatuses.size > 0 && !selectedStatuses.has(m.status))  return false;
      if (selectedCourses.size  > 0 && (!m.course || !selectedCourses.has(m.course))) return false;
      if (selectedSectors.size  > 0 && !m.sectors.some((s) => selectedSectors.has(s))) return false;
      if (selectedSkills.size   > 0 && !m.skills.some((s)  => selectedSkills.has(s)))  return false;
      if (minY != null && (m.gradYear == null || m.gradYear < minY))     return false;
      if (maxY != null && (m.gradYear == null || m.gradYear > maxY))     return false;
      if (q) {
        const hay = [
          m.firstName, m.surname, `${m.firstName} ${m.surname}`,
          m.email ?? "", m.course ?? "",
          ...m.skills, ...m.sectors,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, query, selectedRoles, selectedStatuses, selectedCourses, selectedSectors, selectedSkills, gradYearMin, gradYearMax]);

  const activeFilterCount =
    selectedRoles.size + selectedStatuses.size + selectedCourses.size +
    selectedSectors.size + selectedSkills.size +
    (gradYearMin ? 1 : 0) + (gradYearMax ? 1 : 0);

  const clearFilters = () => {
    setSelectedRoles(new Set());
    setSelectedStatuses(new Set());
    setSelectedCourses(new Set());
    setSelectedSectors(new Set());
    setSelectedSkills(new Set());
    setGradYearMin("");
    setGradYearMax("");
  };

  return (
    <>
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search by name, email, or what they're working on"
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
            className="text-[0.8rem] text-text-secondary hover:text-text-primary bg-transparent border-0 cursor-pointer transition-colors flex items-center gap-1"
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
            <ChipGroup
              label="Role"
              options={[
                { value: "student", label: "Students" },
                { value: "alum",    label: "Alumni" },
              ]}
              selected={selectedRoles}
              onToggle={(v) => toggleSet(selectedRoles, v as Role, setSelectedRoles)}
            />

            <ChipGroup
              label="Status"
              options={[
                { value: "pending_onboarding", label: "Onboarding" },
                { value: "pending_review",     label: "Awaiting review" },
                { value: "approved",           label: "Approved" },
                { value: "rejected",           label: "Rejected" },
              ]}
              selected={selectedStatuses}
              onToggle={(v) => toggleSet(selectedStatuses, v as Status, setSelectedStatuses)}
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
              <ChipGroup
                label="Interests"
                options={availableSectors.map((s) => ({ value: s, label: s }))}
                selected={selectedSectors}
                onToggle={(v) => toggleSet(selectedSectors, v, setSelectedSectors)}
              />
            )}

            {availableSkills.length > 0 && (
              <ChipGroup
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
        <div className="rounded-2xl bg-bg-card border border-border-subtle overflow-hidden">
          <table className="w-full text-[0.825rem]">
            <thead>
              <tr className="border-b border-border-subtle text-[0.7rem] text-text-muted uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-normal">Name</th>
                <th className="text-left px-4 py-3 font-normal">Email</th>
                <th className="text-left px-4 py-3 font-normal">Role</th>
                <th className="text-left px-4 py-3 font-normal">Status</th>
                <th className="text-left px-4 py-3 font-normal">Course</th>
                <th className="text-left px-4 py-3 font-normal">Year</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-border-subtle last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-text-primary">{m.firstName} {m.surname}</td>
                  <td className="px-4 py-3 text-text-secondary">{m.email ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{m.role}</td>
                  <td className="px-4 py-3 text-text-muted">{STATUS_LABEL[m.status]}</td>
                  <td className="px-4 py-3 text-text-muted truncate max-w-[200px]">{m.course ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{m.gradYear ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(m)}
                      className="px-3 py-1.5 rounded-lg bg-transparent border border-[#ff4d4d]/30 text-[#ff6b6b] text-[0.75rem] cursor-pointer transition-colors hover:bg-[#ff4d4d]/10"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DeleteUserModal member={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function toggleSet<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  setter(next);
}

function ChipGroup<T extends string>({
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

function DeleteUserModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleConfirm = () => {
    setError("");
    const r = reason.trim();
    if (!r) { setError("A reason is required — it will be included in the email."); return; }
    startTransition(async () => {
      const res = await adminDeleteUser(member.id, r);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-[520px] rounded-2xl bg-bg-card border border-[#ff4d4d]/30 p-6">
        <div className="text-[0.7rem] text-[#ff6b6b] tracking-[0.18em] uppercase mb-2">Danger zone</div>
        <h2 className="font-display text-[1.25rem] text-text-primary mb-2">
          Delete {member.firstName} {member.surname}?
        </h2>
        <p className="text-[0.825rem] text-text-secondary leading-relaxed mb-5">
          This permanently removes their profile, posted opportunities, events, VC/grant submissions, and any admin actions they took. They will be emailed the reason below. <span className="text-[#ff6b6b]">This cannot be undone.</span>
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.75rem] text-[#ff6b6b]">
            {error}
          </div>
        )}

        <label htmlFor="reason" className="block text-[0.75rem] text-text-muted mb-1.5">
          Reason (sent to user)
        </label>
        <textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Inappropriate listings violating community guidelines."
          className="w-full px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none focus:border-[#ff4d4d]/50 resize-none mb-5"
        />

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-transparent border border-border text-text-secondary text-[0.85rem] cursor-pointer transition-colors hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !reason.trim()}
            className="px-4 py-2 rounded-lg bg-[#ff4d4d]/15 border border-[#ff4d4d]/30 text-[#ff6b6b] text-[0.85rem] font-medium cursor-pointer transition-colors hover:bg-[#ff4d4d]/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Deleting…" : "Permanently delete + email"}
          </button>
        </div>
      </div>
    </div>
  );
}

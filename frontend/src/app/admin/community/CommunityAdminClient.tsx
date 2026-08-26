"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import SearchableMultiSelect from "@/components/forms/SearchableMultiSelect";
import { useUrlFilters, useSearchDraft } from "@/lib/filters/useUrlFilters";
import { SearchInput, FilterPanel, ChipGroup, RangeFilter } from "@/components/filters/FilterBar";
import { adminDeleteUser } from "./actions";
import type { UserStatus } from "@/lib/database.overrides";

type Status = UserStatus;
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
  // Client-side navigation: this view is already the whole member table,
  // so filtering is local. Putting it in the URL is what lets an admin send
  // "these are the alumni still awaiting review" as a link.
  const filters = useUrlFilters();
  const [query, setQuery] = useSearchDraft(filters);
  const [selected, setSelected] = useState<Member | null>(null);

  const selectedRoles    = filters.getSet("role");
  const selectedStatuses = filters.getSet("status");
  const selectedCourses  = filters.getSet("course");
  const selectedSectors  = filters.getSet("sector");
  const selectedSkills   = filters.getSet("skill");
  const gradYearMin      = filters.get("gradMin");
  const gradYearMax      = filters.get("gradMax");

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


  return (
    <>
      <SearchInput
        label="Search members"
        placeholder="Search by name, email, or what they're working on"
        value={query}
        onChange={setQuery}
      />

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => filters.clear("role", "status", "course", "sector", "skill", "gradMin", "gradMax")}
        resultCount={
          <>
            {filtered.length} of {members.length}
            <span className="sr-only"> members shown</span>
          </>
        }
      >
        <ChipGroup
          label="Role"
          options={[
            { value: "student", label: "Students" },
            { value: "alum",    label: "Alumni" },
          ]}
          selected={selectedRoles}
          onToggle={(v) => filters.toggle("role", v)}
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
          onToggle={(v) => filters.toggle("status", v)}
        />

        {availableCourses.length > 0 && (
          <SearchableMultiSelect
            label="Course"
            options={availableCourses}
            selected={selectedCourses}
            onChange={(next) => filters.apply({ course: [...next] })}
            placeholder="Filter by course — search or pick"
            emptyText="No course matches that search."
          />
        )}

        {availableSectors.length > 0 && (
          <ChipGroup
            label="Interests"
            options={availableSectors.map((s) => ({ value: s, label: s }))}
            selected={selectedSectors}
            onToggle={(v) => filters.toggle("sector", v)}
          />
        )}

        {availableSkills.length > 0 && (
          <ChipGroup
            label="Skills"
            options={availableSkills.map((s) => ({ value: s, label: s }))}
            selected={selectedSkills}
            onToggle={(v) => filters.toggle("skill", v)}
          />
        )}

        {gradYearBounds && (
          <RangeFilter
            label="Graduation year"
            hint={` — range ${gradYearBounds.min}–${gradYearBounds.max}`}
            type="number"
            bounds={gradYearBounds}
            from={gradYearMin}
            to={gradYearMax}
            fromLabel="Graduation year from"
            toLabel="Graduation year to"
            fromPlaceholder={`From ${gradYearBounds.min}`}
            toPlaceholder={`To ${gradYearBounds.max}`}
            onFromChange={(v) => filters.apply({ gradMin: v })}
            onToChange={(v) => filters.apply({ gradMax: v })}
          />
        )}
      </FilterPanel>

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
          className="w-full px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted focus:border-[#ff4d4d]/50 resize-none mb-5"
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

"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SocialLinks from "@/components/SocialLinks";
import SearchableMultiSelect from "@/components/forms/SearchableMultiSelect";
import { Dialog, closeDialog } from "@/components/ui/Dialog";
import { browserClient } from "@/lib/supabase/browser";
import { Skeleton } from "@/components/ui/Skeleton";

type Member = {
  id: string;
  firstName: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  gradYear: number | null;
  // Truncated by list_directory_cards to what the card renders. The full
  // text and the profile links are fetched when the dialog opens — they are
  // most of the payload and almost none of the page.
  bioPreview: string | null;
  workingOnPreview: string | null;
  skills: string[];
  sectors: string[];
  lookingFor: { id: string; role: string }[];
};

type Facets = {
  courses: string[];
  sectors: string[];
  skills: string[];
  grad_min: number | null;
  grad_max: number | null;
  total: number;
};

type Filters = {
  q: string;
  roles: string[];
  courses: string[];
  sectors: string[];
  skills: string[];
  gradMin: string;
  gradMax: string;
  page: number;
};

const MAX_LOOKING_FOR = 3;

// ════════════════════════════════════════════════════════════════════
// Filtering and paging happen on the server; this component's job is to
// keep the URL in step with the controls.
//
// That is not a stylistic choice. The directory used to load every member
// and filter in memory, which meant PostgREST's 1000-row cap silently hid
// everyone past the thousandth, and every navigation shipped the whole
// membership. Neither is fixable while the filter logic lives here.
//
// The upside is that a filtered view is now a shareable URL, and the back
// button steps through filter history.
// ════════════════════════════════════════════════════════════════════
export default function CommunityClient({
  members, newest, facets, filters, matching, pageSize,
}: {
  members: Member[];
  newest: Member[];
  facets: Facets;
  filters: Filters;
  matching: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openMember, setOpenMember] = useState<Member | null>(null);

  // The search box stays locally controlled so typing is never gated on a
  // round trip; the URL catches up on a debounce.
  const [queryDraft, setQueryDraft] = useState(filters.q);
  // Resync when the URL's q changes from outside the box — the back button,
  // or "Clear all". Adjusted during render rather than in an effect, which
  // is React's documented pattern for reacting to a changed prop and avoids
  // rendering one frame with the stale value.
  const [lastAppliedQuery, setLastAppliedQuery] = useState(filters.q);
  if (lastAppliedQuery !== filters.q) {
    setLastAppliedQuery(filters.q);
    setQueryDraft(filters.q);
  }

  const apply = useCallback((next: Record<string, string | string[] | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) params.delete(k);
      else params.set(k, Array.isArray(v) ? v.join(",") : v);
    }
    // Any change other than paging returns to page 1. Staying on page 7 of a
    // result set that now has two pages shows an empty grid.
    if (!("page" in next)) params.delete("page");
    startTransition(() => {
      router.push(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    });
  }, [router, pathname, searchParams]);

  // Debounced so a search is one request per pause, not one per keystroke.
  useEffect(() => {
    if (queryDraft === filters.q) return;
    const t = setTimeout(() => apply({ q: queryDraft }), 300);
    return () => clearTimeout(t);
  }, [queryDraft, filters.q, apply]);

  const toggleValue = (key: string, current: string[], value: string) =>
    apply({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });

  const activeFilterCount =
    filters.roles.length + filters.courses.length + filters.sectors.length +
    filters.skills.length + (filters.gradMin ? 1 : 0) + (filters.gradMax ? 1 : 0);

  const totalPages = Math.max(1, Math.ceil(matching / pageSize));
  const gradYearBounds =
    facets.grad_min != null && facets.grad_max != null
      ? { min: facets.grad_min, max: facets.grad_max }
      : null;

  const clearFilters = () =>
    apply({ role: null, course: null, sector: null, skill: null, gradMin: null, gradMax: null });

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
          aria-label="Search members"
          spellCheck={false}
          autoComplete="off"
          placeholder="Search by name, course, skill, sector, or what they're working on"
          value={queryDraft}
          onChange={(e) => setQueryDraft(e.target.value)}
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-xl text-[0.875rem] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
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
          {/* Announced as filters change, so a screen-reader user hears the
              result count without having to go hunting for it. tabular-nums
              stops the row shifting as the digits change width. */}
          <span role="status" className="ml-auto text-[0.8rem] text-text-muted tabular-nums">
            {matching === facets.total
              ? `${facets.total}`
              : `${matching} of ${facets.total}`}
            <span className="sr-only"> members match</span>
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
              selected={new Set(filters.roles)}
              onToggle={(v) => toggleValue("role", filters.roles, v)}
            />

            {facets.courses.length > 0 && (
              <SearchableMultiSelect
                label="Course"
                options={facets.courses}
                selected={new Set(filters.courses)}
                onChange={(next) => apply({ course: [...next] })}
                placeholder="Filter by course — search or pick"
                emptyText="No course matches that search."
              />
            )}

            {facets.sectors.length > 0 && (
              <FilterGroup
                label="Sectors"
                options={facets.sectors.map((s) => ({ value: s, label: s }))}
                selected={new Set(filters.sectors)}
                onToggle={(v) => toggleValue("sector", filters.sectors, v)}
              />
            )}

            {facets.skills.length > 0 && (
              <FilterGroup
                label="Skills"
                options={facets.skills.map((s) => ({ value: s, label: s }))}
                selected={new Set(filters.skills)}
                onToggle={(v) => toggleValue("skill", filters.skills, v)}
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
                    aria-label="Graduation year from"
                    defaultValue={filters.gradMin}
                    onBlur={(e) => apply({ gradMin: e.target.value })}
                    min={gradYearBounds.min}
                    max={gradYearBounds.max}
                    className="w-[140px] px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary placeholder:text-text-muted focus:border-gold/50"
                  />
                  <span className="text-text-muted text-[0.8rem]">to</span>
                  <input
                    type="number"
                    placeholder={`To ${gradYearBounds.max}`}
                    aria-label="Graduation year to"
                    defaultValue={filters.gradMax}
                    onBlur={(e) => apply({ gradMax: e.target.value })}
                    min={gradYearBounds.min}
                    max={gradYearBounds.max}
                    className="w-[140px] px-3 py-2 bg-white/[0.03] border border-border rounded-lg text-[0.8rem] text-text-primary placeholder:text-text-muted focus:border-gold/50"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* A pending navigation dims the current page rather than replacing it
          with a skeleton: the results are still valid, just about to change,
          and swapping them for placeholders on every keystroke would flash. */}
      <div className={pending ? "opacity-60 transition-opacity duration-150" : undefined}>
        {members.length === 0 ? (
          <div className="text-center py-16 text-text-muted text-[0.85rem]">
            {facets.total === 0 ? "No members yet." : "No members match your search or filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m) => <MemberCard key={m.id} member={m} onClick={() => setOpenMember(m)} />)}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Directory pages" className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={filters.page <= 1 || pending}
            onClick={() => apply({ page: String(filters.page - 1) })}
            className="px-4 py-2 rounded-lg bg-transparent border border-border text-text-secondary text-[0.8rem] cursor-pointer transition-colors hover:text-text-primary hover:border-gold/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="text-[0.8rem] text-text-muted tabular-nums">
            Page {filters.page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={filters.page >= totalPages || pending}
            onClick={() => apply({ page: String(filters.page + 1) })}
            className="px-4 py-2 rounded-lg bg-transparent border border-border text-text-secondary text-[0.8rem] cursor-pointer transition-colors hover:text-text-primary hover:border-gold/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </nav>
      )}

      {openMember && (
        <MemberDialog member={openMember} onClose={() => setOpenMember(null)} />
      )}
    </>
  );
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
  // role="button" (not a real <button>) so the clickable "Looking for" links
  // below can be nested without invalid interactive-in-button HTML. Mirrors
  // the OpportunityCard pattern.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
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

      {m.bioPreview && (
        <p className="text-[0.8rem] text-text-secondary leading-relaxed mt-3 line-clamp-2">
          {m.bioPreview}
        </p>
      )}

      {m.workingOnPreview && (
        <div className="text-[0.75rem] text-text-muted mt-2 leading-relaxed line-clamp-1">
          <span className="text-gold/80">Working on:</span> {m.workingOnPreview}
        </div>
      )}

      {m.lookingFor.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 mt-3 text-[0.7rem] text-text-muted">
          <span>Looking for</span>
          {m.lookingFor.slice(0, MAX_LOOKING_FOR).map((lf) => (
            <Link
              key={lf.id}
              href={`/opportunities#o-${lf.id}`}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-0.5 rounded-full border border-gold/30 text-gold text-[0.7rem] no-underline hover:bg-gold/10 transition-colors"
            >
              {lf.role}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// The fields the list deliberately doesn't carry.
type FullProfile = {
  bio: string | null;
  working_on: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
};

function MemberDialog({ member: m, onClose }: { member: Member; onClose: () => void }) {
  // Fetched on open rather than shipped with the list. A plain select, not
  // an RPC: the profiles RLS policies already restrict reads to approved
  // members, so there is nothing extra to enforce here.
  const [full, setFull] = useState<FullProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    browserClient()
      .from("profiles")
      .select("bio, working_on, linkedin_url, github_url, portfolio_url")
      .eq("id", m.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          console.error("Failed to load profile details:", error);
          setLoadFailed(true);
          return;
        }
        setFull(data as FullProfile);
      });
    return () => { cancelled = true; };
  }, [m.id]);

  return (
    <Dialog
      onClose={onClose}
      label={`Profile of ${m.firstName} ${m.surname}`}
      className="w-full max-w-[600px] rounded-2xl bg-bg-card border border-border-subtle shadow-2xl my-auto"
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
          onClick={closeDialog}
          aria-label="Close"
          className="shrink-0 w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer border-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="px-7 py-5 space-y-5">
        {/* While the full text loads, show the preview the card already has
            rather than an empty box — the dialog opens with content, and the
            untruncated version replaces it in place. */}
        {(full?.bio ?? m.bioPreview) && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1.5">Bio</div>
            <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {full?.bio ?? m.bioPreview}
            </p>
            {!full && !loadFailed && <Skeleton className="h-3 w-2/3 mt-2" />}
          </section>
        )}

        {(full?.working_on ?? m.workingOnPreview) && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-1.5">Working on</div>
            <p className="text-[0.85rem] text-text-secondary leading-relaxed whitespace-pre-wrap">
              {full?.working_on ?? m.workingOnPreview}
            </p>
          </section>
        )}

        {m.lookingFor.length > 0 && (
          <section>
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Looking for</div>
            <div className="flex flex-wrap gap-1.5">
              {m.lookingFor.slice(0, MAX_LOOKING_FOR).map((lf) => (
                <Link
                  key={lf.id}
                  href={`/opportunities#o-${lf.id}`}
                  className="px-2.5 py-1 rounded-full text-[0.725rem] border border-gold/30 text-gold no-underline hover:bg-gold/10 transition-colors"
                >
                  {lf.role}
                </Link>
              ))}
            </div>
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

        {full && (full.linkedin_url || full.github_url || full.portfolio_url) && (
          <section className="pt-3 border-t border-border-subtle">
            <div className="text-[0.7rem] text-text-muted uppercase tracking-wider mb-2">Links</div>
            <SocialLinks
              linkedinUrl={full.linkedin_url}
              githubUrl={full.github_url}
              portfolioUrl={full.portfolio_url}
            />
          </section>
        )}

        {/* Only claim the profile is empty once we know: the links and the
            full text arrive after the dialog opens. */}
        {full && !full.bio && !full.working_on && m.sectors.length === 0 && m.skills.length === 0
          && m.lookingFor.length === 0 && !full.linkedin_url && !full.github_url && !full.portfolio_url && (
          <p className="text-[0.85rem] text-text-muted italic">
            No additional details on this profile yet.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function memberSubtitle(m: Member) {
  if (m.role === "alum") return `Alum · ${m.gradYear ?? "—"}`;
  return m.gradYear ? `Student · class of ${m.gradYear}` : "Imperial student";
}

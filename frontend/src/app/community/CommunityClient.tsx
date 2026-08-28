"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SocialLinks from "@/components/SocialLinks";
import SearchableMultiSelect from "@/components/forms/SearchableMultiSelect";
import { useUrlFilters, useSearchDraft } from "@/lib/filters/useUrlFilters";
import { SearchInput, FilterPanel, ChipGroup, RangeFilter } from "@/components/filters/FilterBar";
import { Pager } from "@/components/ui/Pager";
import { Dialog, closeDialog } from "@/components/ui/Dialog";
import { browserClient } from "@/lib/supabase/browser";
import { Skeleton } from "@/components/ui/Skeleton";
// Type-only, so the server-only module is erased rather than imported.
// bioPreview and workingOnPreview are truncated by list_directory_cards to
// what the card renders; the full text and the profile links are fetched
// when the dialog opens — they are most of the payload and almost none of
// the page.
import type {
  DirectoryMember,
  Facets,
  MemberFilters,
} from "@/lib/data/directory";

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
  members: DirectoryMember[];
  newest: DirectoryMember[];
  facets: Facets;
  filters: MemberFilters;
  matching: number;
  pageSize: number;
}) {
  // Server-side navigation: the directory is too large to ship whole, so a
  // filter is an argument to a Postgres query rather than a local operation.
  // `filters` (the prop) is the server's own parse of these same params —
  // the values rendered here and the values the query ran with are one
  // thing, not two that can disagree.
  const url = useUrlFilters({ navigate: "server", resetKey: "page" });
  const [queryDraft, setQueryDraft] = useSearchDraft(url);

  const [openMember, setOpenMember] = useState<DirectoryMember | null>(null);

  const activeFilterCount =
    filters.roles.length + filters.courses.length + filters.sectors.length +
    filters.skills.length + (filters.gradMin ? 1 : 0) + (filters.gradMax ? 1 : 0);

  const gradYearBounds =
    facets.grad_min != null && facets.grad_max != null
      ? { min: facets.grad_min, max: facets.grad_max }
      : null;


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

      <SearchInput
        label="Search members"
        placeholder="Search by name, course, skill, sector, or what they're working on"
        value={queryDraft}
        onChange={setQueryDraft}
      />

      <FilterPanel
        activeCount={activeFilterCount}
        onClear={() => url.clear("role", "course", "sector", "skill", "gradMin", "gradMax")}
        resultCount={
          <>
            {matching === facets.total ? `${facets.total}` : `${matching} of ${facets.total}`}
            <span className="sr-only"> members match</span>
          </>
        }
      >
        <ChipGroup
          label="Role"
          options={[
            { value: "student", label: "Students" },
            { value: "alum",    label: "Alumni" },
          ]}
          selected={new Set(filters.roles)}
          onToggle={(v) => url.toggle("role", v)}
        />

        {facets.courses.length > 0 && (
          <SearchableMultiSelect
            label="Course"
            options={facets.courses}
            selected={new Set(filters.courses)}
            onChange={(next) => url.apply({ course: [...next] })}
            placeholder="Filter by course — search or pick"
            emptyText="No course matches that search."
          />
        )}

        {facets.sectors.length > 0 && (
          <ChipGroup
            label="Sectors"
            options={facets.sectors.map((s) => ({ value: s, label: s }))}
            selected={new Set(filters.sectors)}
            onToggle={(v) => url.toggle("sector", v)}
          />
        )}

        {facets.skills.length > 0 && (
          <ChipGroup
            label="Skills"
            options={facets.skills.map((s) => ({ value: s, label: s }))}
            selected={new Set(filters.skills)}
            onToggle={(v) => url.toggle("skill", v)}
          />
        )}

        {gradYearBounds && (
          <RangeFilter
            label="Graduation year"
            hint={` — range ${gradYearBounds.min}–${gradYearBounds.max}`}
            type="number"
            bounds={gradYearBounds}
            from={filters.gradMin}
            to={filters.gradMax}
            fromLabel="Graduation year from"
            toLabel="Graduation year to"
            fromPlaceholder={`From ${gradYearBounds.min}`}
            toPlaceholder={`To ${gradYearBounds.max}`}
            // Every keystroke here is a database query, so wait for the field
            // to be finished with rather than filtering on a half-typed year.
            commitOn="blur"
            onFromChange={(v) => url.apply({ gradMin: v })}
            onToChange={(v) => url.apply({ gradMax: v })}
          />
        )}
      </FilterPanel>

      {/* A pending navigation dims the current page rather than replacing it
          with a skeleton: the results are still valid, just about to change,
          and swapping them for placeholders on every keystroke would flash. */}
      <div className={url.pending ? "opacity-60 transition-opacity duration-150" : undefined}>
        {members.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-card px-6 py-14 text-center text-[0.85rem] text-text-muted">
            {facets.total === 0 ? "No members yet." : "No members match your search or filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m) => <MemberCard key={m.id} member={m} onClick={() => setOpenMember(m)} />)}
          </div>
        )}
      </div>

      <Pager
        url={url}
        page={filters.page}
        total={matching}
        pageSize={pageSize}
        label="Directory pages"
      />

      {openMember && (
        <MemberDialog member={openMember} onClose={() => setOpenMember(null)} />
      )}
    </>
  );
}


function NewestCard({ member: m, onClick }: { member: DirectoryMember; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-4 rounded-2xl bg-accent-muted/30 border border-accent/20 hover:border-accent hover:bg-accent-muted/40 transition-colors duration-150 cursor-pointer"
    >
      <div className="text-[0.875rem] font-medium text-text-primary truncate">
        {m.firstName} {m.surname}
      </div>
      <div className="text-[0.7rem] text-text-muted mt-0.5 truncate">
        {memberSubtitle(m)}
      </div>
      {m.course && (
        <div className="mt-2 line-clamp-2 break-words text-[0.7rem] text-text-secondary">{m.course}</div>
      )}
    </button>
  );
}

function MemberCard({ member: m, onClick }: { member: DirectoryMember; onClick: () => void }) {
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
      className="text-left w-full p-5 rounded-2xl bg-bg-card border border-border hover:border-accent hover:bg-bg-card/80 transition-colors duration-150 cursor-pointer group"
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
          <span className="mt-1 shrink-0 text-text-muted transition-colors group-hover:text-text-primary"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5"><line x1="4" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg></span>
        </div>
      </header>

      {m.bioPreview && (
        <p className="mt-3 line-clamp-2 break-words text-[0.8rem] leading-relaxed text-text-secondary">
          {m.bioPreview}
        </p>
      )}

      {m.workingOnPreview && (
        <div className="mt-2 line-clamp-1 break-all text-[0.75rem] leading-relaxed text-text-muted">
          <span className="label-wide text-text-muted">Working on:</span> {m.workingOnPreview}
        </div>
      )}

      {m.lookingFor.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 mt-3 text-[0.7rem] text-text-muted">
          <span>Looking for</span>
          {m.lookingFor.slice(0, MAX_LOOKING_FOR).map((lf) => (
            <Link
              key={lf.id}
              href={`/opportunities?o=${lf.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg border border-border-strong px-2 py-0.5 text-[0.7rem] text-text-primary no-underline transition-colors hover:border-accent hover:bg-white/[0.06]"
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

function MemberDialog({ member: m, onClose }: { member: DirectoryMember; onClose: () => void }) {
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
      className="w-full max-w-[600px] rounded-2xl bg-bg-card border border-border shadow-2xl my-auto"
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
                  href={`/opportunities?o=${lf.id}`}
                  className="rounded-lg border border-border-strong px-2.5 py-1 text-[0.725rem] text-text-primary no-underline transition-colors hover:border-accent hover:bg-white/[0.06]"
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
                <span key={`sec-${s}`} className="px-2.5 py-1 rounded-lg text-[0.725rem] bg-accent-muted text-accent-light border border-accent/20">
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
                <span key={`skl-${s}`} className="px-2.5 py-1 rounded-lg text-[0.725rem] bg-white/[0.03] text-text-secondary border border-border">
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

function memberSubtitle(m: DirectoryMember) {
  if (m.role === "alum") return `Alum · ${m.gradYear ?? "—"}`;
  return m.gradYear ? `Student · class of ${m.gradYear}` : "Imperial student";
}

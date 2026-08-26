import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { Skeleton, FilterBarSkeleton, CardGridSkeleton } from "@/components/ui/Skeleton";
import type { Database } from "@/lib/database.overrides";
import { cached } from "@/lib/cache";
import CommunityClient from "./CommunityClient";

// One screen of cards. Also the ceiling PostgREST would have imposed at
// 1000 whether we asked for it or not — see migration 20260826000003.
export const PAGE_SIZE = 48;

type SearchParams = {
  q?: string; role?: string; course?: string; sector?: string;
  skill?: string; gradMin?: string; gradMax?: string; page?: string;
};

export type DirectoryFilters = {
  q: string;
  roles: string[];
  courses: string[];
  sectors: string[];
  skills: string[];
  gradMin: string;
  gradMax: string;
  page: number;
};

// Multi-value filters travel as comma-separated params so a filtered view
// is a URL you can send someone.
const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function parseFilters(sp: SearchParams): DirectoryFilters {
  const page = Number.parseInt(sp.page ?? "1", 10);
  return {
    q: sp.q ?? "",
    roles: list(sp.role).filter((r) => r === "student" || r === "alum"),
    courses: list(sp.course),
    sectors: list(sp.sector),
    skills: list(sp.skill),
    gradMin: sp.gradMin ?? "",
    gradMax: sp.gradMax ?? "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { supabase, isAdmin } = await requireApprovedUser();
  const filters = parseFilters(await searchParams);

  // Started, not awaited — see the note in app/vcs/page.tsx.
  const data = loadDirectory(supabase, filters, isAdmin);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="community" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Community</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              The Foundry directory
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              <Suspense fallback={<Skeleton className="h-3 w-24 inline-block align-middle" />}>
                <MemberCount data={data} />
              </Suspense>
            </p>
          </div>
          <Suspense
            fallback={
              <>
                <FilterBarSkeleton />
                <CardGridSkeleton className="mt-8" count={9} />
              </>
            }
          >
            <Directory data={data} filters={filters} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

type Facets = {
  courses: string[];
  sectors: string[];
  skills: string[];
  grad_min: number | null;
  grad_max: number | null;
  total: number;
};

type DirectoryData = {
  members: ReturnType<typeof toMember>[];
  newest: ReturnType<typeof toMember>[];
  facets: Facets;
  /** Members matching the current filters, not members overall. */
  matching: number;
};

async function loadDirectory(
  supabase: SupabaseClient<Database>,
  filters: DirectoryFilters,
  isAdmin: boolean,
): Promise<DirectoryData> {
  // Filtering and paging happen in Postgres. They have to: the client used
  // to derive its chips and its search from the full member array, which
  // stopped being possible the moment it only holds one page — and holding
  // the full array is what PostgREST's 1000-row cap silently truncated.
  const [cardsRes, newestRes, facets] = await Promise.all([
    supabase.rpc("list_directory_cards", {
      p_query:    filters.q || undefined,
      p_roles:    filters.roles.length ? filters.roles : undefined,
      p_courses:  filters.courses.length ? filters.courses : undefined,
      p_sectors:  filters.sectors.length ? filters.sectors : undefined,
      p_skills:   filters.skills.length ? filters.skills : undefined,
      p_grad_min: filters.gradMin ? Number.parseInt(filters.gradMin, 10) : undefined,
      p_grad_max: filters.gradMax ? Number.parseInt(filters.gradMax, 10) : undefined,
      p_limit:    PAGE_SIZE,
      p_offset:   (filters.page - 1) * PAGE_SIZE,
      p_sort:     "name",
    }),
    // The "newest members" strip is always the five most recent overall,
    // independent of the filters — the client can no longer slice it out of
    // an array it doesn't have.
    supabase.rpc("list_directory_cards", { p_limit: 5, p_sort: "recent" }),
    // Facets are identical for every member and a couple of hundred bytes,
    // so unlike the result pages they are worth caching.
    cached(
      "directoryFacets",
      async () => {
        const res = await supabase.rpc("list_directory_facets");
        if (res.error) console.error("Failed to load directory facets:", res.error);
        const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Facets | null;
        return row ?? { courses: [], sectors: [], skills: [], grad_min: null, grad_max: null, total: 0 };
      },
      { skip: isAdmin, isCacheable: (f) => f.total > 0 },
    ),
  ]);

  if (cardsRes.error) console.error("Failed to load community:", cardsRes.error);
  if (newestRes.error) console.error("Failed to load newest members:", newestRes.error);

  const rows = (cardsRes.data ?? []) as CardRow[];
  const newestRows = (newestRes.data ?? []) as CardRow[];

  // The roles each member on screen is hiring for. Scoped to the ids we are
  // actually rendering rather than fetching every approved opportunity —
  // that query was previously unbounded too, and it only exists to decorate
  // at most 53 cards.
  const ids = [...new Set([...rows, ...newestRows].map((r) => r.id))];
  const lookingForByUser = new Map<string, { id: string; role: string }[]>();
  if (ids.length > 0) {
    const rolesRes = await supabase
      .from("opportunities")
      .select("id, posted_by, position_name")
      .eq("status", "approved")
      .in("posted_by", ids);
    if (rolesRes.error) console.error("Failed to load open roles:", rolesRes.error);
    for (const r of rolesRes.data ?? []) {
      const list = lookingForByUser.get(r.posted_by) ?? [];
      list.push({ id: r.id, role: r.position_name });
      lookingForByUser.set(r.posted_by, list);
    }
  }

  return {
    members: rows.map((r) => toMember(r, lookingForByUser.get(r.id) ?? [])),
    newest: newestRows.map((r) => toMember(r, lookingForByUser.get(r.id) ?? [])),
    facets,
    // total_count is a window function, so it's on every row and absent when
    // the page is empty.
    matching: rows[0]?.total_count ?? 0,
  };
}

async function MemberCount({ data }: { data: Promise<DirectoryData> }) {
  const { facets } = await data;
  return <>{facets.total} member{facets.total === 1 ? "" : "s"}.</>;
}

async function Directory({
  data, filters,
}: {
  data: Promise<DirectoryData>;
  filters: DirectoryFilters;
}) {
  const { members, newest, facets, matching } = await data;
  return (
    <CommunityClient
      members={members}
      newest={newest}
      facets={facets}
      filters={filters}
      matching={matching}
      pageSize={PAGE_SIZE}
    />
  );
}

// One row of list_directory_cards. bio and working_on are previews, not
// the full text — the dialog reads those directly when it opens.
type CardRow = {
  id: string;
  first_name: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  grad_year: number | null;
  bio: string | null;
  working_on: string | null;
  created_at: string;
  skill_names: string[];
  sector_names: string[];
  total_count: number;
};

function toMember(r: CardRow, lookingFor: { id: string; role: string }[]) {
  return {
    id: r.id,
    firstName: r.first_name,
    surname: r.surname,
    role: r.role,
    course: r.course,
    gradYear: r.grad_year,
    bioPreview: r.bio,
    workingOnPreview: r.working_on,
    skills:  r.skill_names  ?? [],
    sectors: r.sector_names ?? [],
    lookingFor,
  };
}

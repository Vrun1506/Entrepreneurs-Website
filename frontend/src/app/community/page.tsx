import { Suspense } from "react";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { Skeleton, FilterBarSkeleton, CardGridSkeleton } from "@/components/ui/Skeleton";
import {
  directoryPage,
  DIRECTORY_PAGE_SIZE,
  type DirectoryPage,
  type MemberFilters,
} from "@/lib/data/directory";
import CommunityClient from "./CommunityClient";

type SearchParams = {
  q?: string; role?: string; course?: string; sector?: string;
  skill?: string; gradMin?: string; gradMax?: string; page?: string;
};

// Multi-value filters travel as comma-separated params so a filtered view
// is a URL you can send someone.
const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function parseFilters(sp: SearchParams): MemberFilters {
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
  const data = directoryPage(supabase, filters, { isAdmin });

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

async function MemberCount({ data }: { data: Promise<DirectoryPage> }) {
  const { facets } = await data;
  return <>{facets.total} member{facets.total === 1 ? "" : "s"}.</>;
}

async function Directory({
  data, filters,
}: {
  data: Promise<DirectoryPage>;
  filters: MemberFilters;
}) {
  const { members, newest, facets, matching } = await data;
  return (
    <CommunityClient
      members={members}
      newest={newest}
      facets={facets}
      filters={filters}
      matching={matching}
      pageSize={DIRECTORY_PAGE_SIZE}
    />
  );
}

import { Suspense } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Skeleton, FilterBarSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import type { Database, UserStatus } from "@/lib/database.overrides";
import CommunityAdminClient from "./CommunityAdminClient";

// One screen of rows. Rows here are a table, not cards, so this is
// larger than the directory's 48.
export const PAGE_SIZE = 50;

type SearchParams = {
  q?: string; role?: string; status?: string; course?: string;
  sector?: string; skill?: string; gradMin?: string; gradMax?: string; page?: string;
};

export type AdminFilters = {
  q: string;
  roles: string[];
  statuses: string[];
  courses: string[];
  sectors: string[];
  skills: string[];
  gradMin: string;
  gradMax: string;
  page: number;
};

const ROLES: string[] = ["student", "alum"];
const STATUSES: string[] = ["pending_onboarding", "pending_review", "approved", "rejected"];

const list = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function parseFilters(sp: SearchParams): AdminFilters {
  const page = Number.parseInt(sp.page ?? "1", 10);
  return {
    q: sp.q ?? "",
    // Dropping unknown values rather than passing them through: ?role=nonsense
    // is a reachable URL, and an unrecognised value must narrow to nothing
    // rather than be handed to the query as if it were a role.
    roles: list(sp.role).filter((r) => ROLES.includes(r)),
    statuses: list(sp.status).filter((s) => STATUSES.includes(s)),
    courses: list(sp.course),
    sectors: list(sp.sector),
    skills: list(sp.skill),
    gradMin: sp.gradMin ?? "",
    gradMax: sp.gradMax ?? "",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export default async function AdminCommunityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const filters = parseFilters(await searchParams);

  // Started, not awaited: the header renders while the query is in flight.
  const data = loadMembers(supabase, filters);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · community</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              All members
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              <Suspense fallback={<Skeleton className="h-3 w-16 inline-block align-middle" />}>
                <MemberTotal data={data} />
              </Suspense>{" "}
              Filter by role, status, course, year, interests, or skills. Deletion is permanent and notifies the user by email.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
          >
            ← Admin home
          </Link>
        </div>

        <Suspense
          fallback={
            <>
              <FilterBarSkeleton />
              <TableSkeleton className="mt-8" rows={10} />
            </>
          }
        >
          <MemberTable data={data} filters={filters} />
        </Suspense>
      </div>
    </main>
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

const EMPTY_FACETS: Facets = {
  courses: [], sectors: [], skills: [], grad_min: null, grad_max: null, total: 0,
};

type AdminData = {
  members: ReturnType<typeof toMember>[];
  facets: Facets;
  /** Members matching the current filters, not members overall. */
  matching: number;
};

async function loadMembers(
  supabase: SupabaseClient<Database>,
  filters: AdminFilters,
): Promise<AdminData> {
  // Filtering, searching and paging all happen in Postgres. They have to:
  // this page used to select every profile and filter the array in the
  // browser, which PostgREST silently truncated at max_rows (1000) — so
  // past a thousand members, the page an admin uses to find someone was
  // the page that could no longer find them. See migration
  // 20260826000004.
  //
  // Note there is no cached() here, unlike the member directory. Admin
  // reads include pending and rejected profiles and the signup email;
  // none of that belongs in a shared cache, and there is one admin.
  const [rowsRes, facetsRes] = await Promise.all([
    supabase.rpc("admin_list_profiles", {
      p_query:    filters.q || undefined,
      p_roles:    filters.roles.length ? filters.roles : undefined,
      p_statuses: filters.statuses.length ? filters.statuses : undefined,
      p_courses:  filters.courses.length ? filters.courses : undefined,
      p_sectors:  filters.sectors.length ? filters.sectors : undefined,
      p_skills:   filters.skills.length ? filters.skills : undefined,
      p_grad_min: filters.gradMin ? Number.parseInt(filters.gradMin, 10) : undefined,
      p_grad_max: filters.gradMax ? Number.parseInt(filters.gradMax, 10) : undefined,
      p_limit:    PAGE_SIZE,
      p_offset:   (filters.page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("admin_profile_facets"),
  ]);

  if (rowsRes.error)   console.error("Failed to load community list:", rowsRes.error);
  if (facetsRes.error) console.error("Failed to load community facets:", facetsRes.error);

  const rows = (rowsRes.data ?? []) as AdminRow[];
  const facetRow = (Array.isArray(facetsRes.data) ? facetsRes.data[0] : facetsRes.data) as Facets | null;

  return {
    members: rows.map(toMember),
    facets: facetRow ?? EMPTY_FACETS,
    // total_count rides on every row via a window function, so it is
    // absent exactly when the page is empty.
    matching: rows[0]?.total_count ?? 0,
  };
}

async function MemberTotal({ data }: { data: Promise<AdminData> }) {
  const { facets } = await data;
  return <>{facets.total} total.</>;
}

async function MemberTable({
  data, filters,
}: {
  data: Promise<AdminData>;
  filters: AdminFilters;
}) {
  const { members, facets, matching } = await data;
  return (
    <CommunityAdminClient
      members={members}
      facets={facets}
      filters={filters}
      matching={matching}
      pageSize={PAGE_SIZE}
    />
  );
}

type AdminRow = {
  id: string;
  first_name: string;
  surname: string;
  role: "alum" | "student";
  status: UserStatus;
  course: string | null;
  grad_year: number | null;
  email: string | null;
  created_at: string;
  skill_names: string[];
  sector_names: string[];
  total_count: number;
};

function toMember(r: AdminRow) {
  return {
    id:        r.id,
    firstName: r.first_name,
    surname:   r.surname,
    role:      r.role,
    status:    r.status,
    course:    r.course,
    gradYear:  r.grad_year,
    email:     r.email,
    createdAt: r.created_at,
    skills:    r.skill_names  ?? [],
    sectors:   r.sector_names ?? [],
  };
}

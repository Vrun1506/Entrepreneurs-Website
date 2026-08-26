import { Suspense } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { Skeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import type { Database } from "@/lib/database.overrides";
import UsersReview from "./UsersReview";

// Smaller than /admin/community's 50: each row here is a full review card
// with bio, what they're working on, and their links — the heaviest
// per-row shape in the app.
export const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const parsed = Number.parseInt((await searchParams).page ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  // Started, not awaited: the header renders while the query is in flight.
  const data = loadPending(supabase, page);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · review queue</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              Pending alumni profiles
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              <Suspense fallback={<Skeleton className="h-3 w-32 inline-block align-middle" />}>
                <PendingCount data={data} />
              </Suspense>
            </p>
          </div>
          <Link
            href="/admin"
            className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
          >
            ← Admin home
          </Link>
        </div>

        <Suspense fallback={<RowListSkeleton count={4} />}>
          <Queue data={data} page={page} />
        </Suspense>
      </div>
    </main>
  );
}

type PendingData = {
  items: ReturnType<typeof toMember>[];
  total: number;
};

async function loadPending(
  supabase: SupabaseClient<Database>,
  page: number,
): Promise<PendingData> {
  // Paged in Postgres. The unbounded version was silently capped at
  // PostgREST's max_rows (1000) — a queue that stops showing its own
  // backlog past a thousand entries, with nothing to say so. Oldest
  // first: whoever has waited longest gets reviewed first.
  const { data, error } = await supabase.rpc("admin_list_pending_profiles", {
    p_limit:  PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  if (error) console.error("Failed to load pending profiles:", error);

  const rows = (data ?? []) as PendingRow[];
  return {
    items: rows.map(toMember),
    // total_count rides on every row via a window function, so it is
    // absent exactly when the queue is empty.
    total: rows[0]?.total_count ?? 0,
  };
}

async function PendingCount({ data }: { data: Promise<PendingData> }) {
  const { total } = await data;
  return <>{total} awaiting review.</>;
}

async function Queue({ data, page }: { data: Promise<PendingData>; page: number }) {
  const { items, total } = await data;

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center text-text-muted text-[0.85rem]">
        {total === 0 ? "Nothing pending. The queue is clear." : "No profiles on this page."}
      </div>
    );
  }

  return <UsersReview items={items} page={page} total={total} pageSize={PAGE_SIZE} />;
}

type PendingRow = {
  id: string;
  first_name: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  grad_year: number | null;
  bio: string | null;
  working_on: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  created_at: string;
  skill_names: string[];
  sector_names: string[];
  total_count: number;
};

function toMember(r: PendingRow) {
  return {
    id: r.id,
    firstName: r.first_name,
    surname: r.surname,
    role: r.role,
    course: r.course,
    gradYear: r.grad_year,
    bio: r.bio,
    workingOn: r.working_on,
    linkedinUrl: r.linkedin_url,
    githubUrl: r.github_url,
    portfolioUrl: r.portfolio_url,
    createdAt: r.created_at,
    skills:  r.skill_names  ?? [],
    sectors: r.sector_names ?? [],
  };
}

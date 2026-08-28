import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Skeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import { listPendingProfiles, type PendingProfilesPage } from "@/lib/data/admin";
import type { Db } from "@/lib/data/query";
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
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8 rule-draw pt-6">
          <div className="min-w-0">
            <p className="label-wide text-text-secondary mb-3">Admin · review queue</p>
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

async function loadPending(supabase: Db, page: number): Promise<PendingProfilesPage> {
  return listPendingProfiles(supabase, {
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
}

async function PendingCount({ data }: { data: Promise<PendingProfilesPage> }) {
  const { total } = await data;
  return <>{total} awaiting review.</>;
}

async function Queue({ data, page }: { data: Promise<PendingProfilesPage>; page: number }) {
  const { items, total } = await data;

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-card px-6 py-14 text-center text-[0.85rem] text-text-muted">
        {total === 0 ? "Nothing pending. The queue is clear." : "No profiles on this page."}
      </div>
    );
  }

  return <UsersReview items={items} page={page} total={total} pageSize={PAGE_SIZE} />;
}

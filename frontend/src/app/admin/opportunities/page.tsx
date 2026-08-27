import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPendingOpportunities } from "@/lib/data/admin";
import OpportunitiesReview from "./OpportunitiesReview";

export default async function AdminOpportunitiesPage() {
  const supabase = await createClient();

  const pending = await listPendingOpportunities(supabase);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · review queue</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              Pending opportunities
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              {pending.length} awaiting review.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/opportunities/new" className="px-3 py-1.5 rounded-full bg-gold text-bg-primary text-[0.8rem] font-medium no-underline transition-colors hover:bg-gold-light">
              + New opportunity
            </Link>
            <Link href="/admin" className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary">
              ← Admin home
            </Link>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center text-text-muted text-[0.85rem]">
            Nothing pending. The queue is clear.
          </div>
        ) : (
          <OpportunitiesReview items={pending} />
        )}
      </div>
    </main>
  );
}

import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { myListingStats, statsKey } from "@/lib/data/activity";
import { mySubmissions } from "@/lib/data/ownListings";
import MySubmissionsClient from "./MySubmissionsClient";

export default async function MySubmissionsPage() {
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const [own, stats] = await Promise.all([
    mySubmissions(supabase, user.id),
    myListingStats(supabase),
  ]);

  // A listing has no stats row until someone views or clicks it, so an
  // absent key is a real zero rather than a missing read.
  const statFor = (kind: "opportunity" | "event" | "vc_grant", id: string) =>
    stats.get(statsKey(kind, id)) ?? { views: 0, clicks: 0 };

  const opportunities = own.opportunities.map((r) => ({
    id: r.id, title: r.position_name, subtitle: r.company,
    status: r.status, createdAt: r.created_at,
    rejectedReason: r.rejected_reason,
    stats: statFor("opportunity", r.id),
  }));
  const events = own.events.map((r) => ({
    id: r.id, title: r.title, subtitle: null,
    status: r.status, createdAt: r.created_at,
    rejectedReason: r.rejected_reason,
    stats: statFor("event", r.id),
  }));
  const vcs = own.vcs.map((r) => ({
    id: r.id, title: r.name, subtitle: r.kind,
    status: r.status, createdAt: r.created_at,
    rejectedReason: r.rejected_reason,
    stats: statFor("vc_grant", r.id),
  }));

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="submissions" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="mb-8 grid grid-cols-1 gap-x-10 md:grid-cols-[10rem_1fr] border-t border-border pt-6">
            <p className="label-wide text-text-secondary mb-3 md:mb-0">Your submissions</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)] md:col-start-2 md:row-start-1">
              Everything you&apos;ve posted
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed md:col-start-2">
              Every opportunity, event, and VC/grant you&apos;ve posted, across all statuses. View and click counts are recorded once they go live — only other members count, not you. You can edit pending listings, and delete any of them at any time. Deleting an approved listing removes it from the community directory immediately and cannot be undone.
            </p>
          </div>
          <MySubmissionsClient opportunities={opportunities} events={events} vcs={vcs} />
        </div>
      </main>
    </div>
  );
}

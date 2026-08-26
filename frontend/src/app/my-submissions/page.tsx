import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import MySubmissionsClient from "./MySubmissionsClient";

export default async function MySubmissionsPage() {
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const [oppRes, evRes, vcRes, statsRes] = await Promise.all([
    supabase.from("opportunities").select("id, position_name, company, status, created_at, rejected_reason").eq("posted_by", user.id).order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, status, created_at, rejected_reason").eq("posted_by", user.id).order("created_at", { ascending: false }),
    supabase.from("vcs_grants").select("id, name, kind, status, created_at, rejected_reason").eq("posted_by", user.id).order("created_at", { ascending: false }),
    supabase.rpc("get_my_listing_stats"),
  ]);

  type ListingStatus = "pending" | "approved" | "rejected" | "expired";
  type Stat = { views: number; clicks: number };

  const statsByKey = new Map<string, Stat>();
  for (const r of (statsRes.data ?? []) as { listing_kind: string; listing_id: string; view_count: number; click_count: number }[]) {
    statsByKey.set(`${r.listing_kind}:${r.listing_id}`, {
      views:  r.view_count  ?? 0,
      clicks: r.click_count ?? 0,
    });
  }
  const statFor = (kind: "opportunity" | "event" | "vc_grant", id: string): Stat =>
    statsByKey.get(`${kind}:${id}`) ?? { views: 0, clicks: 0 };

  const opportunities = (oppRes.data ?? []).map((r) => ({
    id: r.id as string, title: r.position_name as string, subtitle: r.company as string,
    status: r.status as ListingStatus, createdAt: r.created_at as string,
    rejectedReason: r.rejected_reason as string | null,
    stats: statFor("opportunity", r.id as string),
  }));
  const events = (evRes.data ?? []).map((r) => ({
    id: r.id as string, title: r.title as string, subtitle: null,
    status: r.status as ListingStatus, createdAt: r.created_at as string,
    rejectedReason: r.rejected_reason as string | null,
    stats: statFor("event", r.id as string),
  }));
  const vcs = (vcRes.data ?? []).map((r) => ({
    id: r.id as string, title: r.name as string, subtitle: r.kind as string,
    status: r.status as ListingStatus, createdAt: r.created_at as string,
    rejectedReason: r.rejected_reason as string | null,
    stats: statFor("vc_grant", r.id as string),
  }));

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="submissions" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Your submissions</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              Everything you&apos;ve posted
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Every opportunity, event, and VC/grant you&apos;ve posted, across all statuses. View and click counts are recorded once they go live — only other members count, not you. You can edit pending listings, and delete any of them at any time. Deleting an approved listing removes it from the community directory immediately and cannot be undone.
            </p>
          </div>
          <MySubmissionsClient opportunities={opportunities} events={events} vcs={vcs} />
        </div>
      </main>
    </div>
  );
}

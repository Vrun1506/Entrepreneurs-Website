import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import MyActivityClient from "./MyActivityClient";

export default async function MyActivityPage() {
  const { supabase, isAdmin } = await requireApprovedUser();

  const { data: rows, error } = await supabase.rpc("get_my_activity");
  if (error) console.error("Failed to load my-activity:", error);

  const items = ((rows ?? []) as ActivityRow[]).map(toItem);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="settings" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-6 sm:px-8 py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Your activity</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              Things you&apos;ve applied to or are going to
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Every opportunity and VC/grant you&apos;ve marked as applied, plus every event you&apos;re going to. We take your word for it — there&apos;s no verification against the apply or RSVP site. Use the toggle to unmark.
            </p>
          </div>
          <MyActivityClient items={items} />
        </div>
      </main>
    </div>
  );
}

type ActivityRow = {
  listing_kind: "opportunity" | "event" | "vc_grant";
  listing_id:   string;
  action_type:  "applied" | "going";
  marked_at:    string;
  title:        string;
  subtitle:     string | null;
  status:       string;
  occurs_at:    string | null;
  url:          string | null;
};

function toItem(r: ActivityRow) {
  return {
    listingKind: r.listing_kind,
    listingId:   r.listing_id,
    actionType:  r.action_type,
    markedAt:    r.marked_at,
    title:       r.title,
    subtitle:    r.subtitle,
    status:      r.status,
    occursAt:    r.occurs_at,
    url:         r.url,
  };
}

import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import CalendarClient, { type CalItem } from "./CalendarClient";

export default async function CalendarPage() {
  const { supabase, user, isAdmin } = await requireApprovedUser();

  // Two sources: items the user marked as applied/going (get_my_activity)
  // and listings the user posted themselves. Own listings cover pending +
  // approved — their actual commitments — and are read directly (RLS lets
  // a poster see their own rows regardless of status, same as
  // /my-submissions). Past items drop off via the client's upcoming filter.
  const [activityRes, evRes, oppRes, vcRes] = await Promise.all([
    supabase.rpc("get_my_activity"),
    supabase.from("events")
      .select("id, title, description, location, organiser_name, luma_link, event_at, status")
      .eq("posted_by", user.id).in("status", ["pending", "approved"]),
    supabase.from("opportunities")
      .select("id, position_name, company, pay, location_type, location_text, description, application_deadline, apply_method, apply_url, status")
      .eq("posted_by", user.id).in("status", ["pending", "approved"]),
    supabase.from("vcs_grants")
      .select("id, kind, name, description, link, amount, deadline, stage, status")
      .eq("posted_by", user.id).in("status", ["pending", "approved"]),
  ]);

  if (activityRes.error) console.error("Failed to load calendar activity:", activityRes.error);
  if (evRes.error)  console.error("Failed to load own events:", evRes.error);
  if (oppRes.error) console.error("Failed to load own opportunities:", oppRes.error);
  if (vcRes.error)  console.error("Failed to load own vcs:", vcRes.error);

  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const locationLabel = (type: string, text: string | null) => {
    const t = type === "remote" ? "Remote" : type === "onsite" ? "Onsite" : "Hybrid";
    return clean(text) ? `${t} · ${text!.trim()}` : t;
  };

  const activityItems: CalItem[] = ((activityRes.data ?? []) as ActivityRow[])
    .filter((r) => r.occurs_at != null)
    .map((r) => ({
      listingKind: r.listing_kind, listingId: r.listing_id,
      title: r.title, subtitle: r.subtitle, occursAt: r.occurs_at as string,
      role: r.action_type, status: "approved", description: null,
      meta: clean(r.url) ? [{ label: "Link", value: r.url!, href: r.url! }] : [],
    }));

  const ownEvents: CalItem[] = ((evRes.data ?? []) as OwnEvent[])
    .filter((r) => r.event_at != null)
    .map((r) => ({
      listingKind: "event", listingId: r.id, title: r.title, subtitle: clean(r.location),
      occursAt: r.event_at as string, role: "organising", status: r.status as Status,
      description: clean(r.description),
      meta: [
        ...(clean(r.location)        ? [{ label: "Location",   value: r.location!.trim() }] : []),
        ...(clean(r.organiser_name)  ? [{ label: "Organiser",  value: r.organiser_name!.trim() }] : []),
        ...(clean(r.luma_link)       ? [{ label: "Event page", value: r.luma_link!.trim(), href: r.luma_link!.trim() }] : []),
      ],
    }));

  const ownOpps: CalItem[] = ((oppRes.data ?? []) as OwnOpp[])
    .filter((r) => r.application_deadline != null)
    .map((r) => ({
      listingKind: "opportunity", listingId: r.id, title: r.position_name, subtitle: clean(r.company),
      occursAt: r.application_deadline as string, role: "posted", status: r.status as Status,
      description: clean(r.description),
      meta: [
        ...(clean(r.company) ? [{ label: "Company",  value: r.company.trim() }] : []),
        ...(clean(r.pay)     ? [{ label: "Pay",      value: r.pay!.trim() }] : []),
        { label: "Location", value: locationLabel(r.location_type, r.location_text) },
        r.apply_method === "link" && clean(r.apply_url)
          ? { label: "How to apply", value: r.apply_url!.trim(), href: r.apply_url!.trim() }
          : { label: "How to apply", value: "Contact the poster" },
      ],
    }));

  const ownVcs: CalItem[] = ((vcRes.data ?? []) as OwnVc[])
    .filter((r) => r.deadline != null)
    .map((r) => ({
      listingKind: "vc_grant", listingId: r.id, title: r.name,
      subtitle: r.kind === "grant" ? "Grant" : "Venture capital",
      occursAt: r.deadline as string, role: "posted", status: r.status as Status,
      description: clean(r.description),
      meta: [
        { label: "Type", value: r.kind === "grant" ? "Grant" : "Venture capital" },
        ...(clean(r.amount) ? [{ label: "Amount", value: r.amount!.trim() }] : []),
        ...(clean(r.stage)  ? [{ label: "Stage",  value: r.stage!.trim() }] : []),
        ...(clean(r.link)   ? [{ label: "Link",   value: r.link.trim(), href: r.link.trim() }] : []),
      ],
    }));

  // De-dupe by listing — a user may have marked their own listing as
  // going. Own-posted is listed first so its role ("Organising") wins.
  const byKey = new Map<string, CalItem>();
  for (const i of [...ownEvents, ...ownOpps, ...ownVcs, ...activityItems]) {
    const key = `${i.listingKind}:${i.listingId}`;
    if (!byKey.has(key)) byKey.set(key, i);
  }
  const items = Array.from(byKey.values());

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="calendar" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-6 sm:px-8 py-12">
        <div className="max-w-[1080px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Your calendar</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              Events, opportunity deadlines, and VC deadlines
            </h1>
          </div>
          <CalendarClient items={items} />
        </div>
      </main>
    </div>
  );
}

type Status = "pending" | "approved";

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

type OwnEvent = { id: string; title: string; description: string | null; location: string | null; organiser_name: string | null; luma_link: string | null; event_at: string | null; status: string };
type OwnOpp   = { id: string; position_name: string; company: string; pay: string | null; location_type: string; location_text: string | null; description: string | null; application_deadline: string | null; apply_method: string; apply_url: string | null; status: string };
type OwnVc    = { id: string; kind: string; name: string; description: string | null; link: string; amount: string | null; deadline: string | null; stage: string | null; status: string };

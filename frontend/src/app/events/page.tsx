import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import EventsClient from "./EventsClient";

export default async function EventsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (!isAdmin) {
    if (profile.status === "pending_onboarding") redirect("/onboarding");
    if (profile.status === "pending_review")     redirect("/pending");
    if (profile.status === "rejected")           redirect("/rejected");
  }

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("events")
    .select(`
      id, title, description, luma_link,
      event_at, location, organiser_name,
      contact_email, contact_email_visible,
      posted_by, created_at,
      profiles:posted_by ( first_name, surname, linkedin_url )
    `)
    .eq("status", "approved")
    .gte("event_at", nowIso)
    .order("event_at", { ascending: true });

  if (error) console.error("Failed to load events:", error);

  const items = ((rows ?? []) as unknown as RawRow[]).map(toEvent);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="events" isApproved={true} isAdmin={!!isAdmin} />
      <main className="flex-1 px-8 py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Events</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Upcoming Foundry events
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
                {items.length} upcoming event{items.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href="/events/new"
              className="px-4 py-2 rounded-full bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors duration-150 hover:bg-gold-light"
            >
              Post an event →
            </Link>
          </div>
          <EventsClient items={items} />
        </div>
      </main>
    </div>
  );
}

type RawRow = {
  id: string;
  title: string;
  description: string;
  luma_link: string;
  event_at: string;
  location: string;
  organiser_name: string;
  contact_email: string;
  contact_email_visible: boolean;
  posted_by: string;
  created_at: string;
  profiles: { first_name: string; surname: string; linkedin_url: string | null } | null;
};

function toEvent(r: RawRow) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    lumaLink: r.luma_link,
    eventAt: r.event_at,
    location: r.location,
    organiserName: r.organiser_name,
    contactEmail: r.contact_email_visible ? r.contact_email : null,
    postedBy: {
      firstName: r.profiles?.first_name ?? "",
      surname:   r.profiles?.surname    ?? "",
      linkedinUrl: r.profiles?.linkedin_url ?? null,
    },
  };
}

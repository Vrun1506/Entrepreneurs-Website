import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import EventForm, { type EventInitialValues } from "../../new/EventForm";

type Params = { id: string };

// Convert a UTC timestamp from Postgres to the value="…" string the
// <input type="datetime-local"> control wants, in the browser's local
// tz. We do this server-side as a best effort using the request's
// implicit tz (UTC on Vercel) — the user re-edits the field anyway.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default async function EditEventPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const { supabase, user, isAdmin } = await requireApprovedUser();

  // Need first/last for the organiser default. Guard only returned status,
  // so re-query the two extra columns.
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, surname")
    .eq("id", user.id)
    .single();
  if (!profile) notFound();

  // SECURITY DEFINER RPC checks caller = poster and returns
  // contact_email accordingly (migration 20260530000002).
  const rowRes = await supabase.rpc("get_event_for_edit", { p_id: id });
  const row = (Array.isArray(rowRes.data) ? rowRes.data[0] : rowRes.data) as
    | {
        id: string; title: string; description: string; luma_link: string;
        event_at: string; location: string; organiser_name: string;
        contact_email: string; contact_email_visible: boolean;
        status: string; posted_by: string;
      }
    | null;
  if (!row) notFound();
  if (row.status !== "pending") notFound();

  const initialValues: EventInitialValues = {
    title:               row.title as string,
    description:         row.description as string,
    lumaLink:            row.luma_link as string,
    eventAt:             toDatetimeLocal(row.event_at as string),
    location:            row.location as string,
    organiserName:       row.organiser_name as string,
    contactEmail:        row.contact_email as string,
    contactEmailVisible: row.contact_email_visible as boolean,
  };

  const defaultOrganiser = `${profile.first_name} ${profile.surname}`.trim() || "";

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="events" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <Link href="/my-submissions" className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6">
            ← Your submissions
          </Link>
          <div className="mb-10">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Edit event</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              {row.title}
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              You can edit this event while it&apos;s still pending review. Once an admin approves it, it&apos;ll be locked.
            </p>
          </div>
          <EventForm
            signupEmail={user.email ?? ""}
            defaultOrganiser={defaultOrganiser}
            mode="user"
            editingId={id}
            initialValues={initialValues}
          />
        </div>
      </main>
    </div>
  );
}

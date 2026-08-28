import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { posterName } from "@/lib/data/profiles";
import { eventForEdit } from "@/lib/data/events";
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
  const poster = await posterName(supabase, user.id);
  if (!poster) notFound();

  // The RPC checks caller = poster, so a listing someone else posted
  // comes back empty and 404s here. Status still gates editability.
  const row = await eventForEdit(supabase, id);
  if (!row) notFound();
  if (row.status !== "pending") notFound();

  const initialValues: EventInitialValues = {
    title:               row.title,
    description:         row.description,
    lumaLink:            row.luma_link,
    eventAt:             toDatetimeLocal(row.event_at),
    location:            row.location,
    organiserName:       row.organiser_name,
    contactEmail:        row.contact_email,
    contactEmailVisible: row.contact_email_visible,
  };

  const defaultOrganiser = poster.displayName;

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="events" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <Link href="/my-submissions" className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6">
            ← Your submissions
          </Link>
          <div className="mb-10 border-t border-border pt-6">
            <p className="label-wide text-text-secondary mb-3">Edit event</p>
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

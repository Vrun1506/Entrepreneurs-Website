import { redirect } from "next/navigation";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { posterName } from "@/lib/data/profiles";
import EventForm from "./EventForm";

export default async function NewEventPage() {
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const poster = await posterName(supabase, user.id);
  if (!poster) redirect("/login");

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="events" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[720px] mx-auto">
          <div className="mb-8 border-t border-border pt-6">
            <p className="label-wide text-text-secondary mb-3">Post an event</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              Share an event with the network
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Submissions go to the admin queue for review before they appear on the Events tab.
            </p>
          </div>

          <EventForm
            signupEmail={user.email ?? ""}
            defaultOrganiser={poster.displayName}
            mode="user"
          />
        </div>
      </main>
    </div>
  );
}

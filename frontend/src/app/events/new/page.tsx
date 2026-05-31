import { redirect } from "next/navigation";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import EventForm from "./EventForm";

export default async function NewEventPage() {
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, surname")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="events" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[720px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Post an event</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              Share an event with the network
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Submissions go to the admin queue for review before they appear on the Events tab.
            </p>
          </div>

          <EventForm
            signupEmail={user.email ?? ""}
            defaultOrganiser={`${profile.first_name} ${profile.surname}`.trim()}
            mode="user"
          />
        </div>
      </main>
    </div>
  );
}

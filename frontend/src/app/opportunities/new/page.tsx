import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import OpportunityForm from "./OpportunityForm";

export default async function NewOpportunityPage() {
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

  const [{ data: skills }, { data: sectors }] = await Promise.all([
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("sectors").select("id, name").order("name"),
  ]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="opportunities" isApproved={true} isAdmin={!!isAdmin} />
      <main className="flex-1 px-8 py-12">
        <div className="max-w-[720px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Post an opportunity</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              Share a role with the network
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Submissions go to the admin queue for review before they appear on the Opportunities tab.
            </p>
          </div>

          <OpportunityForm
            signupEmail={user.email ?? ""}
            skills={skills ?? []}
            sectors={sectors ?? []}
            mode="user"
          />
        </div>
      </main>
    </div>
  );
}

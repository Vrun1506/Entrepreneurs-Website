import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OpportunityForm from "@/app/opportunities/new/OpportunityForm";

export default async function AdminNewOpportunityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: skills }, { data: sectors }] = await Promise.all([
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("sectors").select("id, name").order("name"),
  ]);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · direct publish</div>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.1] tracking-tight">
              New opportunity
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              Skips the approval queue — published immediately.
            </p>
          </div>
          <Link href="/admin/opportunities" className="text-[0.8rem] text-text-secondary no-underline hover:text-text-primary">
            ← Back to queue
          </Link>
        </div>

        <OpportunityForm
          signupEmail={user.email ?? ""}
          skills={skills ?? []}
          sectors={sectors ?? []}
          mode="admin"
        />
      </div>
    </main>
  );
}

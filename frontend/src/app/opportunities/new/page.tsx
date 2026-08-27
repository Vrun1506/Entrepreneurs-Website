import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listTaxonomy } from "@/lib/data/taxonomy";
import OpportunityForm from "./OpportunityForm";

export default async function NewOpportunityPage() {
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const { skills, sectors } = await listTaxonomy(supabase);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="opportunities" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
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
            skills={skills}
            sectors={sectors}
            mode="user"
          />
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listTaxonomy, opportunityTaxonomy } from "@/lib/data/taxonomy";
import { opportunityForEdit } from "@/lib/data/opportunities";
import OpportunityForm, { type OpportunityInitialValues } from "../../new/OpportunityForm";

type Params = { id: string };

export default async function EditOpportunityPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const { supabase, user, isAdmin } = await requireApprovedUser();

  // SECURITY DEFINER RPC enforces caller = poster and returns
  // contact_email accordingly (migration 20260530000002).
  const [row, taxonomy, selected] = await Promise.all([
    opportunityForEdit(supabase, id),
    listTaxonomy(supabase),
    opportunityTaxonomy(supabase, id),
  ]);

  if (!row) notFound();
  // posted_by check happens inside the RPC; status still gates editability.
  if (row.status !== "pending") notFound();

  const initialValues: OpportunityInitialValues = {
    positionName:        row.position_name,
    company:             row.company,
    pay:                 row.pay,
    locationType:        row.location_type,
    locationText:        row.location_text ?? "",
    description:         row.description,
    startMonth:          String(row.start_month),
    startYear:           String(row.start_year),
    applicationDeadline: row.application_deadline,
    contactEmail:        row.contact_email,
    contactEmailVisible: row.contact_email_visible,
    applyMethod:         row.apply_method,
    applyUrl:            row.apply_url ?? "",
    skillIds:            selected.skillIds,
    sectorIds:           selected.sectorIds,
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="opportunities" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <Link href="/my-submissions" className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6">
            ← Your submissions
          </Link>
          <div className="mb-10 border-t border-border pt-6">
            <p className="label-wide text-text-secondary mb-3">Edit opportunity</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              {row.position_name}
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              You can edit this listing while it&apos;s still pending review. Once an admin approves it, it&apos;ll be locked.
            </p>
          </div>
          <OpportunityForm
            signupEmail={user.email ?? ""}
            skills={taxonomy.skills}
            sectors={taxonomy.sectors}
            mode="user"
            editingId={id}
            initialValues={initialValues}
          />
        </div>
      </main>
    </div>
  );
}

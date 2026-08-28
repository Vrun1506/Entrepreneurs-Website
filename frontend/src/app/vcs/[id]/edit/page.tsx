import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { requireApprovedUser } from "@/lib/auth/guard";
import { vcForEdit } from "@/lib/data/vcs";
import VcForm, { type VcInitialValues } from "../../new/VcForm";

type Params = { id: string };

export default async function EditVcGrantPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const row = await vcForEdit(supabase, id);
  if (!row) notFound();
  if (row.posted_by !== user.id) notFound();
  if (row.status !== "pending") notFound();

  const initialValues: VcInitialValues = {
    kind:        row.kind,
    name:        row.name,
    description: row.description,
    link:        row.link,
    amount:      row.amount ?? "",
    deadline:    row.deadline ?? "",
    stage:       row.stage ?? "",
  };

  return (
    <AppShell active="vcs" isAdmin={isAdmin}>
      <div className="px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <Link href="/my-submissions" className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6">
            ← Your submissions
          </Link>
          <div className="mb-10 rule-draw pt-6">
            <p className="label-wide text-text-secondary mb-3">Edit {row.kind === "vc" ? "VC" : "grant"}</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)]">
              {row.name}
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              You can edit this listing while it&apos;s still pending review. Once an admin approves it, it&apos;ll be locked.
            </p>
          </div>
          <VcForm
            mode="user"
            editingId={id}
            initialValues={initialValues}
          />
        </div>
      </div>
    </AppShell>
  );
}

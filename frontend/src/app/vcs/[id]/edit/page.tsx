import Link from "next/link";
import { notFound } from "next/navigation";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import VcForm, { type VcInitialValues } from "../../new/VcForm";

type Params = { id: string };

export default async function EditVcGrantPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const { supabase, user, isAdmin } = await requireApprovedUser();

  const { data: row } = await supabase
    .from("vcs_grants")
    .select("posted_by, status, kind, name, description, link, amount, deadline, stage")
    .eq("id", id)
    .single();
  if (!row) notFound();
  if (row.posted_by !== user.id) notFound();
  if (row.status !== "pending") notFound();

  const initialValues: VcInitialValues = {
    kind:        row.kind as "vc" | "grant",
    name:        row.name as string,
    description: row.description as string,
    link:        row.link as string,
    amount:      (row.amount as string | null) ?? "",
    deadline:    (row.deadline as string | null) ?? "",
    stage:       (row.stage as string | null) ?? "",
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="vcs" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[820px] mx-auto">
          <Link href="/my-submissions" className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6">
            ← Your submissions
          </Link>
          <div className="mb-10">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Edit {row.kind === "vc" ? "VC" : "grant"}</div>
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
      </main>
    </div>
  );
}

import Link from "next/link";
import VcForm from "@/app/vcs/new/VcForm";

export default function AdminNewVcPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[720px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · direct publish</div>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.1] tracking-tight">
              New VC / grant
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              Skips the approval queue — published immediately.
            </p>
          </div>
          <Link href="/admin/vcs" className="text-[0.8rem] text-text-secondary no-underline hover:text-text-primary">
            ← Back to queue
          </Link>
        </div>

        <VcForm mode="admin" />
      </div>
    </div>
  );
}

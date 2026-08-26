import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VcsReview from "./VcsReview";

export default async function AdminVcsPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("vcs_grants")
    .select(`
      id, kind, name, description, link,
      amount, deadline, stage,
      posted_by, created_at,
      profiles:posted_by ( first_name, surname, linkedin_url )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) console.error("Failed to load pending vcs_grants:", error);

  const rawRows = (rows ?? []) as unknown as RawRow[];

  const posterIds = Array.from(new Set(rawRows.map((r) => r.posted_by)));
  const signupEmailById = new Map<string, string>();
  if (posterIds.length > 0) {
    const { data: emails, error: emailsErr } = await supabase
      .rpc("admin_get_signup_emails", { p_user_ids: posterIds });
    if (emailsErr) console.error("Failed to load signup emails:", emailsErr);
    for (const row of (emails ?? []) as { user_id: string; email: string }[]) {
      signupEmailById.set(row.user_id, row.email);
    }
  }

  const pending = rawRows.map((r) => toReviewItem(r, signupEmailById.get(r.posted_by) ?? null));

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · review queue</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              Pending VCs & grants
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">{pending.length} awaiting review.</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/vcs/new" className="px-3 py-1.5 rounded-full bg-gold text-bg-primary text-[0.8rem] font-medium no-underline transition-colors hover:bg-gold-light">
              + New listing
            </Link>
            <Link href="/admin" className="text-[0.8rem] text-text-secondary no-underline hover:text-text-primary">
              ← Admin home
            </Link>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center text-text-muted text-[0.85rem]">
            Nothing pending. The queue is clear.
          </div>
        ) : (
          <VcsReview items={pending} />
        )}
      </div>
    </main>
  );
}

type RawRow = {
  id: string;
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
  posted_by: string;
  created_at: string;
  profiles: { first_name: string; surname: string; linkedin_url: string | null } | null;
};

function toReviewItem(r: RawRow, signupEmail: string | null) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    link: r.link,
    amount: r.amount,
    deadline: r.deadline,
    stage: r.stage,
    postedBy: {
      firstName: r.profiles?.first_name ?? "",
      surname:   r.profiles?.surname    ?? "",
      linkedinUrl: r.profiles?.linkedin_url ?? null,
      signupEmail,
    },
    createdAt: r.created_at,
  };
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OpportunitiesReview from "./OpportunitiesReview";

export default async function AdminOpportunitiesPage() {
  const supabase = await createClient();

  // Admin-only RPC raises if caller isn't admin; column-level grant on
  // contact_email is revoked from authenticated so this is the only way
  // for admins to read the field (migration 20260530000002).
  const { data: rows, error } = await supabase
    .rpc("list_pending_opportunities_admin");

  if (error) console.error("Failed to load pending opportunities:", error);

  const rawRows = (rows ?? []) as RawRow[];

  // auth.users isn't exposed via PostgREST; fetch signup emails via the
  // admin_get_signup_emails RPC (SECURITY DEFINER, gated to is_admin()).
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
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · review queue</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              Pending opportunities
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              {pending.length} awaiting review.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/opportunities/new" className="px-3 py-1.5 rounded-full bg-gold text-bg-primary text-[0.8rem] font-medium no-underline transition-colors hover:bg-gold-light">
              + New opportunity
            </Link>
            <Link href="/admin" className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary">
              ← Admin home
            </Link>
          </div>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center text-text-muted text-[0.85rem]">
            Nothing pending. The queue is clear.
          </div>
        ) : (
          <OpportunitiesReview items={pending} />
        )}
      </div>
    </div>
  );
}

type RawRow = {
  id: string;
  position_name: string;
  company: string;
  pay: string;
  location_type: "remote" | "hybrid" | "onsite";
  location_text: string | null;
  description: string;
  start_month: number;
  start_year: number;
  application_deadline: string;
  contact_email: string;
  contact_email_visible: boolean;
  apply_method: "email" | "link";
  apply_url: string | null;
  posted_by: string;
  created_at: string;
  poster_first_name: string | null;
  poster_surname: string | null;
  poster_linkedin_url: string | null;
  skill_names: string[];
  sector_names: string[];
};

function toReviewItem(r: RawRow, signupEmail: string | null) {
  return {
    id: r.id,
    positionName: r.position_name,
    company: r.company,
    pay: r.pay,
    locationType: r.location_type,
    locationText: r.location_text,
    description: r.description,
    startMonth: r.start_month,
    startYear: r.start_year,
    applicationDeadline: r.application_deadline,
    contactEmail: r.contact_email,
    contactEmailVisible: r.contact_email_visible,
    applyMethod: r.apply_method,
    applyUrl: r.apply_url,
    postedBy: {
      firstName:   r.poster_first_name ?? "",
      surname:     r.poster_surname    ?? "",
      linkedinUrl: r.poster_linkedin_url,
      signupEmail,
    },
    skills:  r.skill_names  ?? [],
    sectors: r.sector_names ?? [],
    createdAt: r.created_at,
  };
}

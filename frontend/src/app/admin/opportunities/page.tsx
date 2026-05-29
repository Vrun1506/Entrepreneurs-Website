import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OpportunityReviewCard from "./OpportunityReviewCard";

export default async function AdminOpportunitiesPage() {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from("opportunities")
    .select(`
      id, position_name, company, pay,
      location_type, location_text,
      description, start_month, start_year,
      application_deadline,
      contact_email, contact_email_visible,
      apply_method, apply_url,
      posted_by, created_at,
      profiles:posted_by ( first_name, surname, linkedin_url ),
      opportunity_skills  ( skills  ( id, name ) ),
      opportunity_sectors ( sectors ( id, name ) )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) console.error("Failed to load pending opportunities:", error);

  const rawRows = (rows ?? []) as unknown as RawRow[];

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
          <div className="space-y-4">
            {pending.map((o) => <OpportunityReviewCard key={o.id} opportunity={o} />)}
          </div>
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
  profiles: { first_name: string; surname: string; linkedin_url: string | null } | null;
  opportunity_skills:  { skills:  { id: number; name: string } | null }[];
  opportunity_sectors: { sectors: { id: number; name: string } | null }[];
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
      firstName: r.profiles?.first_name ?? "",
      surname:   r.profiles?.surname    ?? "",
      linkedinUrl: r.profiles?.linkedin_url ?? null,
      signupEmail,
    },
    skills:  r.opportunity_skills.map((s)  => s.skills?.name).filter((n): n is string => !!n),
    sectors: r.opportunity_sectors.map((s) => s.sectors?.name).filter((n): n is string => !!n),
    createdAt: r.created_at,
  };
}

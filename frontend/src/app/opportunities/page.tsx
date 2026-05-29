import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage() {
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

  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await supabase
    .from("opportunities")
    .select(`
      id, position_name, company, pay,
      location_type, location_text,
      description, start_month, start_year,
      application_deadline,
      contact_email, contact_email_visible,
      apply_method, apply_url,
      posted_by,
      created_at,
      profiles:posted_by ( first_name, surname, linkedin_url ),
      opportunity_skills  ( skills  ( id, name ) ),
      opportunity_sectors ( sectors ( id, name ) )
    `)
    .eq("status", "approved")
    .gte("application_deadline", today)
    .order("created_at", { ascending: false });

  if (error) console.error("Failed to load opportunities:", error);

  const items = ((rows ?? []) as unknown as RawRow[]).map(toOpportunity);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="opportunities" isApproved={true} isAdmin={!!isAdmin} />
      <main className="flex-1 px-8 py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Opportunities</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Roles from the Foundry network
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
                {items.length} open role{items.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href="/opportunities/new"
              className="px-4 py-2 rounded-full bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors duration-150 hover:bg-gold-light"
            >
              Post an opportunity →
            </Link>
          </div>
          <OpportunitiesClient items={items} />
        </div>
      </main>
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

function toOpportunity(r: RawRow) {
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
    // Defense in depth: never ship the contact email to the client unless
    // the poster opted in to visibility. The DB row carries both fields.
    contactEmail: r.contact_email_visible ? r.contact_email : null,
    applyMethod: r.apply_method,
    applyUrl: r.apply_url,
    postedBy: {
      firstName: r.profiles?.first_name ?? "",
      surname:   r.profiles?.surname    ?? "",
      linkedinUrl: r.profiles?.linkedin_url ?? null,
    },
    skills:  r.opportunity_skills.map((s)  => s.skills?.name).filter((n): n is string => !!n),
    sectors: r.opportunity_sectors.map((s) => s.sectors?.name).filter((n): n is string => !!n),
  };
}

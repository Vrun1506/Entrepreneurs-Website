import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app/AppShell";
import { listTaxonomy, profileTaxonomy } from "@/lib/data/taxonomy";
import AffiliationSection from "./AffiliationSection";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, taxonomy, selected, isAdminRes] = await Promise.all([
    supabase.from("profiles").select("role, status, first_name, surname, course, grad_year, linkedin_url, github_url, portfolio_url, bio, working_on").eq("id", user.id).single(),
    listTaxonomy(supabase),
    profileTaxonomy(supabase, user.id),
    supabase.rpc("is_admin"),
  ]);

  const profile = profileRes.data;
  const isAdmin = !!isAdminRes.data;
  if (!profile) redirect("/login");
  // Admins bypass the onboarding gate so they can browse the user-facing UI for diagnostics.
  if (!isAdmin && profile.status === "pending_onboarding") redirect("/onboarding");

  return (
    <AppShell active="settings" isApproved={profile.status === "approved"} isAdmin={isAdmin}>
      <div className="px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[640px] mx-auto">
          <Link
            href="/settings"
            className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6"
          >
            ← Settings
          </Link>
          <div className="mb-10 rule-draw pt-6">
            <p className="label-wide text-text-secondary mb-3">Your profile</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              Edit your details
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Changes are visible in the directory once you&apos;re approved.
            </p>
          </div>

          <ProfileForm
            role={profile.role}
            firstName={profile.first_name}
            surname={profile.surname}
            course={profile.course ?? ""}
            gradYear={profile.grad_year}
            linkedinUrl={profile.linkedin_url ?? ""}
            githubUrl={profile.github_url ?? ""}
            portfolioUrl={profile.portfolio_url ?? ""}
            bio={profile.bio ?? ""}
            workingOn={profile.working_on ?? ""}
            skills={taxonomy.skills}
            sectors={taxonomy.sectors}
            selectedSkills={selected.skillIds}
            selectedSectors={selected.sectorIds}
          />

          <div className="mt-8">
            <AffiliationSection role={profile.role} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

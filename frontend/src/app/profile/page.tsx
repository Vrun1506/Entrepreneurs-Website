import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, skillsRes, sectorsRes, profSkillsRes, profSectorsRes, isAdminRes] = await Promise.all([
    supabase.from("profiles").select("role, status, first_name, surname, linkedin_url, github_url, grad_year, bio, working_on").eq("id", user.id).single(),
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("sectors").select("id, name").order("name"),
    supabase.from("profile_skills").select("skill_id").eq("profile_id", user.id),
    supabase.from("profile_sectors").select("sector_id").eq("profile_id", user.id),
    supabase.rpc("is_admin"),
  ]);

  const profile = profileRes.data;
  const isAdmin = !!isAdminRes.data;
  if (!profile) redirect("/login");
  // Admins bypass the onboarding gate so they can browse the user-facing UI for diagnostics.
  if (!isAdmin && profile.status === "pending_onboarding") redirect("/onboarding");

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="settings" isApproved={profile.status === "approved"} isAdmin={isAdmin} />
      <main className="flex-1 px-8 py-12">
        <div className="max-w-[640px] mx-auto">
          <Link
            href="/settings"
            className="inline-flex items-center text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary mb-6"
          >
            ← Settings
          </Link>
          <div className="mb-10">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Your profile</div>
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
            linkedinUrl={profile.linkedin_url ?? ""}
            githubUrl={profile.github_url ?? ""}
            gradYear={profile.grad_year}
            bio={profile.bio ?? ""}
            workingOn={profile.working_on ?? ""}
            skills={skillsRes.data ?? []}
            sectors={sectorsRes.data ?? []}
            selectedSkills={(profSkillsRes.data ?? []).map((r) => r.skill_id)}
            selectedSectors={(profSectorsRes.data ?? []).map((r) => r.sector_id)}
          />
        </div>
      </main>
    </div>
  );
}

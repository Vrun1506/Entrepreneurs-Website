import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTaxonomy } from "@/lib/data/taxonomy";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, taxonomy, isAdminRes] = await Promise.all([
    supabase.from("profiles").select("role, status, first_name, surname").eq("id", user.id).single(),
    listTaxonomy(supabase),
    supabase.rpc("is_admin"),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/login");
  const isAdmin = !!isAdminRes.data;

  // Route away if onboarding is already done — keeps the flow one-way.
  // Admins bypass this so they can preview the form for diagnostics.
  if (!isAdmin) {
    if (profile.status === "pending_review") redirect("/pending");
    if (profile.status === "approved")       redirect("/community");
    if (profile.status === "rejected")       redirect("/rejected");
  }

  return (
    <OnboardingForm
      role={profile.role}
      firstName={profile.first_name}
      surname={profile.surname}
      skills={taxonomy.skills}
      sectors={taxonomy.sectors}
    />
  );
}

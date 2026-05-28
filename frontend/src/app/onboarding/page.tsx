import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, skillsRes, sectorsRes] = await Promise.all([
    supabase.from("profiles").select("role, status, first_name, surname").eq("id", user.id).single(),
    supabase.from("skills").select("id, name").order("name"),
    supabase.from("sectors").select("id, name").order("name"),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/login");

  // Route away if onboarding is already done — keeps the flow one-way.
  if (profile.status === "pending_review") redirect("/pending");
  if (profile.status === "approved")       redirect("/community");
  if (profile.status === "rejected")       redirect("/rejected");

  return (
    <OnboardingForm
      role={profile.role}
      firstName={profile.first_name}
      surname={profile.surname}
      skills={skillsRes.data ?? []}
      sectors={sectorsRes.data ?? []}
    />
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import ContactForm from "./ContactForm";

export default async function ContactPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, isAdminRes] = await Promise.all([
    supabase.from("profiles").select("status").eq("id", user.id).single(),
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
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Contact</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              Get in touch
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Report a bug, ask a question, or flag something off. We&apos;ll reply to{" "}
              <span className="text-text-secondary">{user.email}</span>.
            </p>
          </div>

          <ContactForm />
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import PasswordChangeForm from "./PasswordChangeForm";
import DeleteAccountSection from "./DeleteAccountSection";
import SessionsSection from "./SessionsSection";

export default async function SettingsPage() {
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

  // OAuth-only users have no password to change. Surfaced in the password card.
  const hasPassword = (user.identities ?? []).some((i) => i.provider === "email");

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="settings" isApproved={profile.status === "approved"} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[640px] mx-auto">
          <div className="mb-10">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Settings</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              Account & profile
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              Signed in as <span className="text-text-secondary">{user.email}</span>
            </p>
          </div>

          <div className="space-y-5">
            <Link
              href="/profile"
              className="block rounded-2xl bg-bg-card border border-border-subtle p-6 no-underline transition-colors duration-150 hover:border-gold/40 hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-[0.95rem] font-medium text-text-primary">Edit your profile</div>
                <span className="text-text-muted text-[1.1rem]">→</span>
              </div>
            </Link>

            <Link
              href="/my-submissions"
              className="block rounded-2xl bg-bg-card border border-border-subtle p-6 no-underline transition-colors duration-150 hover:border-gold/40 hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-[0.95rem] font-medium text-text-primary">Your submissions</div>
                <span className="text-text-muted text-[1.1rem]">→</span>
              </div>
            </Link>

            <Link
              href="/my-bookmarks"
              className="block rounded-2xl bg-bg-card border border-border-subtle p-6 no-underline transition-colors duration-150 hover:border-gold/40 hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-[0.95rem] font-medium text-text-primary">Saved opportunities</div>
                <span className="text-text-muted text-[1.1rem]">→</span>
              </div>
            </Link>

            <Link
              href="/contact"
              className="block rounded-2xl bg-bg-card border border-border-subtle p-6 no-underline transition-colors duration-150 hover:border-gold/40 hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="text-[0.95rem] font-medium text-text-primary">Contact the team</div>
                <span className="text-text-muted text-[1.1rem]">→</span>
              </div>
            </Link>

            <PasswordChangeForm hasPassword={hasPassword} />

            <SessionsSection />

            <DeleteAccountSection email={user.email ?? ""} />
          </div>
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import PasswordChangeForm from "./PasswordChangeForm";
import DeleteAccountSection from "./DeleteAccountSection";

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
      <main className="flex-1 px-8 py-12">
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
                <div>
                  <div className="text-[0.95rem] font-medium text-text-primary mb-1">Edit your profile</div>
                  <div className="text-[0.8rem] text-text-muted leading-relaxed">
                    Name, bio, what you&apos;re working on, skills, sectors, links.
                  </div>
                </div>
                <span className="text-text-muted text-[1.1rem]">→</span>
              </div>
            </Link>

            <Link
              href="/contact"
              className="block rounded-2xl bg-bg-card border border-border-subtle p-6 no-underline transition-colors duration-150 hover:border-gold/40 hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[0.95rem] font-medium text-text-primary mb-1">Contact the team</div>
                  <div className="text-[0.8rem] text-text-muted leading-relaxed">
                    Report a bug, ask a question, or flag an issue.
                  </div>
                </div>
                <span className="text-text-muted text-[1.1rem]">→</span>
              </div>
            </Link>

            <PasswordChangeForm hasPassword={hasPassword} />

            <DeleteAccountSection email={user.email ?? ""} />
          </div>
        </div>
      </main>
    </div>
  );
}

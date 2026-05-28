import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/app/admin/SignOutButton";

export default async function PendingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, first_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  // Admins bypass status gates so they can preview the page for diagnostics.
  if (!isAdmin) {
    if (profile.status === "pending_onboarding") redirect("/onboarding");
    if (profile.status === "approved")           redirect("/community");
    if (profile.status === "rejected")           redirect("/rejected");
  }

  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col">
      <header className="px-8 py-5">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="w-7 h-7 rounded-md bg-gold flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="#0c0c0b" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-[1.1rem] text-text-primary tracking-tight">Foundry</span>
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[520px] text-center">
          <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-4">Application received</div>
          <h1 className="font-display text-text-primary leading-[1.1] tracking-tight mb-6 text-[clamp(2rem,4vw,2.75rem)]">
            Thanks, {profile.first_name || "there"}.
          </h1>
          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.7] mb-3">
            We&apos;ve received your application and our team will review it manually.
          </p>
          <p className="text-[0.875rem] text-text-muted leading-[1.7]">
            Review isn&apos;t instant — we&apos;ll email you when there&apos;s an update.
            You can edit your profile in the meantime.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/profile"
              className="px-5 py-2.5 rounded-xl bg-gold text-bg-primary text-[0.85rem] font-medium no-underline transition-colors duration-150 hover:bg-gold-light"
            >
              Edit your profile
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

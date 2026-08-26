import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/app/admin/SignOutButton";
import { BrandLogo } from "@/components/BrandLogo";
import { redirectAwayFrom } from "@/lib/auth/status";

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
    const away = redirectAwayFrom("/pending", profile.status);
    if (away) redirect(away);
  }

  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col">
      <header className="sticky top-0 z-40 px-8 py-5 bg-bg-primary/90 backdrop-blur-md border-b border-border-subtle">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <Link href="/" className="no-underline">
            <BrandLogo size="sm" />
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

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/app/admin/SignOutButton";

export default async function RejectedPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, first_name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.status === "pending_onboarding") redirect("/onboarding");
  if (profile.status === "pending_review")     redirect("/pending");
  if (profile.status === "approved")           redirect("/community");

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
          <h1 className="font-display text-text-primary leading-[1.1] tracking-tight mb-6 text-[clamp(2rem,4vw,2.75rem)]">
            Application not approved.
          </h1>
          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.7] mb-3">
            Thanks for your interest in Foundry. Unfortunately, we weren&apos;t able to approve your membership.
          </p>
          <p className="text-[0.875rem] text-text-muted leading-[1.7]">
            If you believe this was a mistake or your circumstances have changed,
            please reply to the email we sent and we&apos;ll take another look.
          </p>
        </div>
      </main>
    </div>
  );
}

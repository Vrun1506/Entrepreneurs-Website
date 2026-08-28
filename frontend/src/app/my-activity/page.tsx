import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { myActivity } from "@/lib/data/activity";
import MyActivityClient from "./MyActivityClient";

export default async function MyActivityPage() {
  const { supabase, isAdmin } = await requireApprovedUser();

  const items = await myActivity(supabase);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="activity" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-6 sm:px-8 py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="mb-8 grid grid-cols-1 gap-x-10 md:grid-cols-[10rem_1fr] border-t border-border pt-6">
            <p className="label-wide text-text-secondary mb-3 md:mb-0">Your activity</p>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3vw,2.5rem)] md:col-start-2 md:row-start-1">
              Things you&apos;ve applied to or are going to
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed md:col-start-2">
              Every opportunity and VC/grant you&apos;ve marked as applied, plus every event you&apos;re going to. We take your word for it — there&apos;s no verification against the apply or RSVP site. Use the toggle to unmark.
            </p>
          </div>
          <MyActivityClient items={items} />
        </div>
      </main>
    </div>
  );
}

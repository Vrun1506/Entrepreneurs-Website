import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { count: pendingProfiles },
    { count: pendingOpportunities },
    { count: pendingEvents },
    { count: pendingVcs },
  ] = await Promise.all([
    supabase.from("profiles").select("id",     { count: "exact", head: true }).eq("status", "pending_review"),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("events").select("id",        { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("vcs_grants").select("id",    { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const totalPending =
    (pendingProfiles ?? 0) + (pendingOpportunities ?? 0) + (pendingEvents ?? 0) + (pendingVcs ?? 0);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin</div>
            <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] tracking-tight">
              Foundry control panel
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2 flex items-center gap-2">
              {totalPending > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gold text-bg-primary text-[0.75rem] font-semibold">
                  {totalPending} awaiting review
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-white/[0.04] text-text-muted text-[0.75rem]">
                  Queues clear
                </span>
              )}
              <span>· Signed in as <span className="text-text-secondary">{user?.email}</span></span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/community"
              className="text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary"
            >
              ← Back to site
            </Link>
            <SignOutButton />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <QueueLink
            href="/admin/users"
            title="Pending alumni profiles"
            count={pendingProfiles ?? 0}
            hint="Manual verification"
          />
          <QueueLink
            href="/admin/opportunities"
            title="Pending opportunities"
            count={pendingOpportunities ?? 0}
            hint="Review queue"
          />
          <QueueLink
            href="/admin/events"
            title="Pending events"
            count={pendingEvents ?? 0}
            hint="Review queue"
          />
          <QueueLink
            href="/admin/vcs"
            title="Pending VCs / grants"
            count={pendingVcs ?? 0}
            hint="Review queue"
          />
        </div>

        <div className="mt-10">
          <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Quick create</div>
          <p className="text-[0.8rem] text-text-muted mb-4 leading-relaxed">
            Publish directly without going through the approval queue.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <DiagLink href="/admin/opportunities/new" label="+ Opportunity" />
            <DiagLink href="/admin/events/new"        label="+ Event" />
            <DiagLink href="/admin/vcs/new"           label="+ VC / grant" />
          </div>
        </div>

        <div className="mt-10">
          <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Community management</div>
          <p className="text-[0.8rem] text-text-muted mb-4 leading-relaxed">
            Search the full membership and remove accounts. Use the graduate cleanup once a year to roll out current students whose graduation year has passed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DiagLink href="/admin/community" label="All members · search + delete" />
            <DiagLink href="/admin/graduates" label="Graduate cleanup" />
          </div>
        </div>

      </div>
    </div>
  );
}

function QueueLink({ href, title, count, hint }: { href: string; title: string; count: number; hint: string }) {
  return (
    <Link
      href={href}
      className="block p-5 rounded-xl bg-bg-card border border-border-subtle no-underline transition-colors duration-150 hover:border-gold/40 hover:bg-bg-card-hover"
    >
      <div className="flex items-start justify-between mb-1">
        <div className="text-[0.9rem] font-medium text-text-primary">{title}</div>
        {count > 0 ? (
          <div className="min-w-[1.5rem] text-center px-2 py-0.5 rounded-full bg-gold text-bg-primary text-[0.75rem] font-semibold">{count}</div>
        ) : (
          <div className="text-[0.85rem] font-medium text-text-muted">0</div>
        )}
      </div>
      <div className="text-[0.75rem] text-text-muted">{hint}</div>
    </Link>
  );
}

function DiagLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-3 rounded-lg bg-bg-card border border-border-subtle text-center text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:border-gold/40 hover:text-text-primary"
    >
      {label}
    </Link>
  );
}

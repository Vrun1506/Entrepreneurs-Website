import Link from "next/link";
import { Suspense } from "react";
import AppShell from "@/components/app/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listApprovedEvents } from "@/lib/data/events";
import { listApprovedOpportunities } from "@/lib/data/opportunities";
import { formatDateTime } from "@/lib/dates";

// ════════════════════════════════════════════════════════════════════
// Foundry · Home
//
// The landing surface behind auth. Two live sections — what's on soon and
// what's been posted — plus search.
//
// The prototype also shows a "Connection requests" block. There is no
// connections table, so it is not here: a card that renders nothing, or
// worse renders a placeholder, teaches members that this screen is
// decoration. It goes in when intro_requests does.
// ════════════════════════════════════════════════════════════════════

export default async function HomePage() {
  const { supabase, user } = await requireApprovedUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, surname, preferred_name")
    .eq("id", user.id)
    .single();

  const name =
    profile?.preferred_name?.trim() || profile?.first_name?.trim() || "there";
  const fullName = [profile?.first_name, profile?.surname].filter(Boolean).join(" ");

  // Started, not awaited — the two sections resolve in the same tick.
  const events = listApprovedEvents(supabase);
  const opps = listApprovedOpportunities(supabase);

  return (
    <AppShell active="home" name={fullName || name}>
      <div className="mx-auto w-full max-w-[1100px] px-6 py-10 sm:px-10">
        <header className="mb-12">
          <p className="mb-1 text-[0.8rem] text-text-muted">Hello,</p>
          <h1 className="mb-7 font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] tracking-tight text-text-primary">
            {name}
          </h1>

          <form action="/members" method="get" role="search" className="flex max-w-[34rem] gap-2">
            <label htmlFor="q" className="sr-only">
              Search members
            </label>
            <input
              id="q"
              name="q"
              type="search"
              placeholder="Search members by name, skill or course"
              className="min-w-0 flex-1 rounded-lg border border-border bg-white/[0.03] px-4 py-2.5 text-[0.85rem] text-text-primary transition-colors duration-150 placeholder:text-text-muted focus:border-accent focus:bg-white/[0.05]"
            />
            <button
              type="submit"
              className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.06] px-5 py-2.5 text-[0.825rem] text-text-primary transition-colors duration-150 hover:border-accent hover:bg-white/[0.10]"
            >
              Search
            </button>
          </form>
        </header>

        <Section
          title="Upcoming events"
          blurb="Foundry gatherings and member meetups"
          href="/events"
          hrefLabel="All events"
        >
          <Suspense fallback={<CardsSkeleton />}>
            <Events data={events} />
          </Suspense>
        </Section>

        <Section
          title="Opportunities"
          blurb="Roles, projects and introductions shared by members"
          href="/opportunities"
          hrefLabel="All opportunities"
        >
          <Suspense fallback={<CardsSkeleton />}>
            <Opportunities data={opps} />
          </Suspense>
        </Section>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  blurb,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  blurb: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <div className="mb-5 flex items-end justify-between gap-4 border-b border-border-subtle pb-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.4rem] leading-tight tracking-tight text-text-primary">
            {title}
          </h2>
          <p className="mt-0.5 text-[0.825rem] text-text-muted">{blurb}</p>
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-lg border border-border-strong bg-white/[0.04] px-3.5 py-1.5 text-[0.775rem] text-text-secondary no-underline transition-colors duration-150 hover:border-accent hover:text-text-primary"
        >
          {hrefLabel} →
        </Link>
      </div>
      {children}
    </section>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-36 w-full" />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-border bg-white/[0.02] px-5 py-6 text-[0.85rem] text-text-secondary">
      {children}
    </p>
  );
}

async function Events({ data }: { data: ReturnType<typeof listApprovedEvents> }) {
  const all = await data;
  const soon = all.slice(0, 3);
  if (soon.length === 0) {
    return <Empty>Nothing scheduled yet. Post the first one from the Events page.</Empty>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {soon.map((e) => (
        <li key={e.id}>
          <Link
            href={`/events/${e.id}`}
            className="block h-full rounded-lg border border-border bg-bg-card p-5 no-underline transition-colors duration-150 hover:border-border-strong hover:bg-bg-card-hover"
          >
            {e.isSocietyEvent && (
              <span className="mb-3 inline-block rounded border border-signal/40 bg-signal-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.1em] text-signal">
                Foundry event
              </span>
            )}
            <p className="mb-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-text-muted">
              {formatDateTime(e.eventAt)}
            </p>
            <p className="mb-2 text-[0.95rem] font-medium leading-snug text-text-primary">
              {e.title}
            </p>
            <p className="text-[0.775rem] text-text-secondary">{e.location}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Opportunities({ data }: { data: ReturnType<typeof listApprovedOpportunities> }) {
  const all = await data;
  const latest = all.slice(0, 3);
  if (latest.length === 0) {
    return <Empty>No open opportunities right now. Post one from the Opportunities page.</Empty>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {latest.map((o) => (
        <li key={o.id}>
          <Link
            href={`/opportunities/${o.id}`}
            className="block h-full rounded-lg border border-border bg-bg-card p-5 no-underline transition-colors duration-150 hover:border-border-strong hover:bg-bg-card-hover"
          >
            <p className="mb-1.5 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-text-muted">
              {o.locationType}
              {o.locationText ? ` · ${o.locationText}` : ""}
            </p>
            <p className="mb-2 text-[0.95rem] font-medium leading-snug text-text-primary">
              {o.positionName}
            </p>
            <p className="text-[0.775rem] text-text-secondary">{o.company}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

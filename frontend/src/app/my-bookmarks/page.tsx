import Link from "next/link";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { listBookmarkedOpportunities } from "@/lib/data/opportunities";
import { markedIds } from "@/lib/data/activity";
import OpportunitiesClient from "../opportunities/OpportunitiesClient";

export default async function MyBookmarksPage() {
  const { supabase, isAdmin } = await requireApprovedUser();

  const [items, appliedIds] = await Promise.all([
    listBookmarkedOpportunities(supabase),
    markedIds(supabase, "opportunity", "applied"),
  ]);

  // Everything on this page is bookmarked by definition — that is what the
  // query selects — so the stars render filled without a second read.
  const bookmarkedIds = items.map((i) => i.id);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="opportunities" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Bookmarks</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Saved opportunities
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
                {items.length === 0
                  ? "Nothing saved yet. Tap the star on any opportunity in the directory to save it for later."
                  : `${items.length} saved opportunit${items.length === 1 ? "y" : "ies"} still open for applications.`}
              </p>
            </div>
            <Link
              href="/opportunities"
              className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
            >
              ← Browse all opportunities
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center">
              <p className="text-[0.85rem] text-text-muted leading-relaxed">
                When you find a role that looks interesting, click the star to save it here. Saved opportunities stay in this list while they&apos;re open and disappear once the application deadline passes.
              </p>
              <Link
                href="/opportunities"
                className="inline-block mt-5 px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
              >
                Browse opportunities →
              </Link>
            </div>
          ) : (
            <OpportunitiesClient items={items} bookmarkedIds={bookmarkedIds} appliedIds={appliedIds} removeOnUnbookmark />
          )}
        </div>
      </main>
    </div>
  );
}

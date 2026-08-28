import AppShell from "@/components/app/AppShell";
import { Skeleton, FilterBarSkeleton, RowListSkeleton } from "@/components/ui/Skeleton";

// Painted the instant a navigation to this route starts, before the server
// has finished anything. Next.js wraps the segment in a Suspense boundary
// automatically and swaps this out when page.tsx streams in.
//
// Without it the browser sits on the *previous* page until the server
// responds, which reads as an unresponsive click.
//
// The shell is rendered here too so the chrome doesn't flash: it looks
// identical either side of the swap. isApproved is true because every
// route with a loading.tsx is behind requireApprovedUser; the real nav
// replaces this within the same paint.
//
// The <main> carries the same id and tabIndex as the real page's. Without
// them the skip link points at nothing for as long as the skeleton is on
// screen — which e2e/a11y.spec.ts caught, because with streaming the
// document finishes loading while the fallback is still displayed.
export default function Loading() {
  return (
    <AppShell active="events">
      <div className="px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-[22rem] max-w-full mt-3" />
            <Skeleton className="h-3 w-32 mt-4" />
          </div>
          <FilterBarSkeleton />
          <div className="mt-8">
            <RowListSkeleton />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

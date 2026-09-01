import AppShell from "@/components/app/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

// Same reasoning as members/loading.tsx: painted instantly on navigation,
// swapped for the real page once its four concurrent queries (newest
// members, events, opportunities, VCs) have resolved. Mirrors the real
// page's own StripSkeleton/CardsSkeleton shapes rather than inventing new
// ones, so there's no visible shift in proportions when the real content
// streams in.
export default function Loading() {
  return (
    <AppShell active="home">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-10 sm:px-10">
        <div className="mb-12">
          <Skeleton className="h-3 w-14 mb-2" />
          <Skeleton className="h-10 w-48" />
        </div>

        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>

        {[0, 1, 2].map((section) => (
          <div key={section} className="mb-14">
            <div className="mb-5 border-b border-border-subtle pb-3">
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-36 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

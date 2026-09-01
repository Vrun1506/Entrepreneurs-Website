import { BrandLogo } from "@/components/BrandLogo";
import { Skeleton } from "@/components/ui/Skeleton";

// Same reasoning as members/loading.tsx: painted instantly on navigation,
// swapped for the real IntakeFlow once its data (taxonomy, sectors, the
// "You're in" matches) has loaded. Mirrors IntakeFlow's own shell rather
// than AppShell's, since the real page doesn't use AppShell either — and
// carries the same #main-content id/tabIndex the real page's <main> does,
// so the skip link isn't left pointing at nothing while this is on screen.
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-primary/90 px-8 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <BrandLogo size="sm" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-12">
        <div className="grid gap-12 lg:grid-cols-[15rem_1fr]">
          <aside className="hidden lg:block space-y-2">
            <Skeleton className="h-3 w-28 mb-2" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </aside>

          <div className="min-w-0">
            <Skeleton className="h-px w-full mb-8" />
            <Skeleton className="h-3 w-32 mb-3" />
            <Skeleton className="h-9 w-2/3 mb-5" />
            <div className="rounded-2xl border border-border bg-bg-card p-6 sm:p-8 space-y-6">
              <div>
                <Skeleton className="h-3 w-1/4 mb-2" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
              <div>
                <Skeleton className="h-3 w-1/3 mb-2" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

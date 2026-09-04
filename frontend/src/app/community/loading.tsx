import AppShell from "@/components/app/AppShell";
import { Skeleton, RowListSkeleton } from "@/components/ui/Skeleton";

// Every other listing page (members, calendar, events, opportunities, vcs,
// profile) has one of these; /community was the one blocking async server
// component with no Suspense boundary, so a slow feed fetch showed a blank
// page instead of a shell. Same pattern as members/loading.tsx — see its
// own comment for why the shell, and the <main> id/tabIndex, matter here.
export default function Loading() {
  return (
    <AppShell active="community">
      <div className="px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[720px] mx-auto">
          <div className="mb-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-64 max-w-full mt-3" />
            <Skeleton className="h-3 w-full max-w-[52ch] mt-4" />
            <Skeleton className="h-3 w-2/3 max-w-[40ch] mt-2" />
          </div>
          <RowListSkeleton count={4} />
        </div>
      </div>
    </AppShell>
  );
}

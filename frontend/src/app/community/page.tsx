import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import { Skeleton, FilterBarSkeleton, CardGridSkeleton } from "@/components/ui/Skeleton";
import type { Database } from "@/lib/database.overrides";
import { cached } from "@/lib/cache";
import CommunityClient from "./CommunityClient";

export default async function CommunityPage() {
  const { supabase, isAdmin } = await requireApprovedUser();

  // Started, not awaited — see the note in app/vcs/page.tsx. This is the
  // heaviest query in the app (it grows with the membership rather than
  // with what's currently live), so it is the one that benefits most from
  // the nav and heading not waiting on it.
  const data = loadDirectory(supabase, isAdmin);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="community" isApproved={true} isAdmin={isAdmin} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Community</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              The Foundry directory
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              <Suspense fallback={<Skeleton className="h-3 w-24 inline-block align-middle" />}>
                <MemberCount data={data} />
              </Suspense>
            </p>
          </div>
          <Suspense
            fallback={
              <>
                <FilterBarSkeleton />
                <CardGridSkeleton className="mt-8" count={9} />
              </>
            }
          >
            <Directory data={data} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

type DirectoryData = {
  directory: ReturnType<typeof toMember>[];
  newest: ReturnType<typeof toMember>[];
  total: number;
};

async function loadDirectory(
  supabase: SupabaseClient<Database>,
  isAdmin: boolean,
): Promise<DirectoryData> {
  // Cacheable in full: unlike opportunities and events, nothing here is
  // masked per caller, and both queries filter by status='approved'
  // explicitly, so every approved member gets identical rows.
  //
  // Worth being clear about what this does and doesn't buy. Measured at
  // 1,203 members, the query takes ~22ms and the payload is ~1.4MB. The
  // cache removes the 22ms; it does nothing about the 1.4MB, which still
  // has to be serialised into the RSC payload on every navigation. The
  // fix for *that* is trimming the card to the fields it actually shows
  // and paginating — a page of 48 card-only rows measures 13kB.
  return cached("directory", () => fetchDirectory(supabase), { skip: isAdmin });
}

async function fetchDirectory(supabase: SupabaseClient<Database>): Promise<DirectoryData> {
  // Member directory + the roles each member is actively hiring for (the
  // position_name of any opportunity they've posted that's live/approved).
  // Approved opportunities are readable by approved members, so no RPC needed.
  //
  // Two queries in parallel, not one per member: the roles are fetched in
  // bulk and grouped in memory below.
  // list_directory_cards truncates bio/working_on to what the card renders
  // and omits the three profile URLs entirely — the dialog fetches those on
  // open. Measured at 1,203 members: 2,261 kB of full profiles becomes
  // 752 kB. Truncating here rather than in the mapper below means the bytes
  // never leave Postgres.
  const [{ data: members, error }, { data: openRoles, error: rolesError }] = await Promise.all([
    supabase.rpc("list_directory_cards"),
    supabase
      .from("opportunities")
      .select("id, posted_by, position_name")
      .eq("status", "approved"),
  ]);

  if (error) console.error("Failed to load community:", error);
  if (rolesError) console.error("Failed to load open roles:", rolesError);

  // posted_by → the roles they're looking for, each carrying the listing id
  // so the profile card can deep-link to that opportunity.
  const lookingForByUser = new Map<string, { id: string; role: string }[]>();
  for (const r of (openRoles ?? []) as { id: string; posted_by: string; position_name: string }[]) {
    const list = lookingForByUser.get(r.posted_by) ?? [];
    list.push({ id: r.id, role: r.position_name });
    lookingForByUser.set(r.posted_by, list);
  }

  const memberRows = (members ?? []) as CardRow[];
  const mapped = memberRows.map((r) => toMember(r, lookingForByUser.get(r.id) ?? []));

  // Newest = first N by created_at desc (the server already returns this order).
  // Directory list = alphabetical for predictable browsing.
  return {
    newest: mapped.slice(0, 5),
    directory: [...mapped].sort((a, b) =>
      `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`)
    ),
    total: mapped.length,
  };
}

async function MemberCount({ data }: { data: Promise<DirectoryData> }) {
  const { total } = await data;
  return <>{total} member{total === 1 ? "" : "s"}.</>;
}

async function Directory({ data }: { data: Promise<DirectoryData> }) {
  const { directory, newest } = await data;
  return <CommunityClient members={directory} newest={newest} />;
}

// One row of list_directory_cards. bio and working_on are previews, not
// the full text — the dialog reads those directly when it opens.
type CardRow = {
  id: string;
  first_name: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  grad_year: number | null;
  bio: string | null;
  working_on: string | null;
  created_at: string;
  skill_names: string[];
  sector_names: string[];
};

function toMember(r: CardRow, lookingFor: { id: string; role: string }[]) {
  return {
    id: r.id,
    firstName: r.first_name,
    surname: r.surname,
    role: r.role,
    course: r.course,
    gradYear: r.grad_year,
    bioPreview: r.bio,
    workingOnPreview: r.working_on,
    skills:  r.skill_names  ?? [],
    sectors: r.sector_names ?? [],
    lookingFor,
  };
}

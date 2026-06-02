import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import CommunityClient from "./CommunityClient";

export default async function CommunityPage() {
  const { supabase, isAdmin } = await requireApprovedUser();

  // Member directory + the roles each member is actively hiring for (the
  // position_name of any opportunity they've posted that's live/approved).
  // Approved opportunities are readable by approved members, so no RPC needed.
  const [{ data: members, error }, { data: openRoles, error: rolesError }] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id,
        first_name,
        surname,
        role,
        course,
        grad_year,
        bio,
        working_on,
        linkedin_url,
        github_url,
        portfolio_url,
        created_at,
        profile_skills ( skills ( id, name ) ),
        profile_sectors ( sectors ( id, name ) )
      `)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select("posted_by, position_name")
      .eq("status", "approved"),
  ]);

  if (error) {
    console.error("Failed to load community:", error);
  }
  if (rolesError) {
    console.error("Failed to load open roles:", rolesError);
  }

  // posted_by → list of role names they're looking for.
  const lookingForByUser = new Map<string, string[]>();
  for (const r of (openRoles ?? []) as { posted_by: string; position_name: string }[]) {
    const list = lookingForByUser.get(r.posted_by) ?? [];
    list.push(r.position_name);
    lookingForByUser.set(r.posted_by, list);
  }

  // PostgREST returns each embedded relation as a single object for many-to-one
  // joins, but supabase-js's untyped client infers it as an array. Cast at the
  // boundary; runtime shape is { skills: { id, name } } per row.
  const memberRows = (members ?? []) as unknown as RawJoinRow[];
  const mapped = memberRows.map((r) => toMember(r, lookingForByUser.get(r.id) ?? []));
  // Newest = first N by created_at desc (the server already returns this order).
  // Directory list = alphabetical for predictable browsing.
  const newest = mapped.slice(0, 5);
  const directory = [...mapped].sort((a, b) =>
    `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`)
  );

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="community" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Community</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
              The Foundry directory
            </h1>
            <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
              {members?.length ?? 0} member{(members?.length ?? 0) === 1 ? "" : "s"}.
            </p>
          </div>
          <CommunityClient members={directory} newest={newest} />
        </div>
      </main>
    </div>
  );
}

type RawJoinRow = {
  id: string;
  first_name: string;
  surname: string;
  role: "alum" | "student";
  course: string | null;
  grad_year: number | null;
  bio: string | null;
  working_on: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  created_at: string;
  profile_skills:  { skills:  { id: number; name: string } | null }[];
  profile_sectors: { sectors: { id: number; name: string } | null }[];
};

function toMember(r: RawJoinRow, lookingFor: string[]) {
  return {
    id: r.id,
    firstName: r.first_name,
    surname: r.surname,
    role: r.role,
    course: r.course,
    gradYear: r.grad_year,
    bio: r.bio,
    workingOn: r.working_on,
    linkedinUrl: r.linkedin_url,
    githubUrl: r.github_url,
    portfolioUrl: r.portfolio_url,
    skills:  r.profile_skills.map((s)  => s.skills?.name).filter((n): n is string => !!n),
    sectors: r.profile_sectors.map((s) => s.sectors?.name).filter((n): n is string => !!n),
    lookingFor,
  };
}

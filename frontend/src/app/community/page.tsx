import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/AppNav";
import CommunityClient from "./CommunityClient";

export default async function CommunityPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  // Admins bypass status gates so they can browse the user-facing UI for diagnostics.
  if (!isAdmin) {
    if (profile.status === "pending_onboarding") redirect("/onboarding");
    if (profile.status === "pending_review")     redirect("/pending");
    if (profile.status === "rejected")           redirect("/rejected");
  }

  const { data: members, error } = await supabase
    .from("profiles")
    .select(`
      id,
      first_name,
      surname,
      role,
      grad_year,
      bio,
      working_on,
      linkedin_url,
      github_url,
      profile_skills ( skills ( id, name ) ),
      profile_sectors ( sectors ( id, name ) )
    `)
    .eq("status", "approved")
    .order("first_name", { ascending: true });

  if (error) {
    console.error("Failed to load community:", error);
  }

  // PostgREST returns each embedded relation as a single object for many-to-one
  // joins, but supabase-js's untyped client infers it as an array. Cast at the
  // boundary; runtime shape is { skills: { id, name } } per row.
  const memberRows = (members ?? []) as unknown as RawJoinRow[];

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="community" isApproved={true} isAdmin={!!isAdmin} />
      <main className="flex-1 px-8 py-12">
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
          <CommunityClient members={memberRows.map(toMember)} />
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
  grad_year: number | null;
  bio: string | null;
  working_on: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  profile_skills:  { skills:  { id: number; name: string } | null }[];
  profile_sectors: { sectors: { id: number; name: string } | null }[];
};

function toMember(r: RawJoinRow) {
  return {
    id: r.id,
    firstName: r.first_name,
    surname: r.surname,
    role: r.role,
    gradYear: r.grad_year,
    bio: r.bio,
    workingOn: r.working_on,
    linkedinUrl: r.linkedin_url,
    githubUrl: r.github_url,
    skills:  r.profile_skills.map((s)  => s.skills?.name).filter((n): n is string => !!n),
    sectors: r.profile_sectors.map((s) => s.sectors?.name).filter((n): n is string => !!n),
  };
}

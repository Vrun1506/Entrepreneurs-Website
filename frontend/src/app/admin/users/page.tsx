import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UsersReview from "./UsersReview";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  // The /admin layout already enforces admin gating, so by the time we
  // get here we know the caller is an admin. RLS lets admins see every
  // profile via profiles_select_admin.
  const { data: rows, error } = await supabase
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
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  if (error) console.error("Failed to load pending profiles:", error);

  // PostgREST returns each embedded relation as a single object for many-to-one
  // joins, but supabase-js's untyped client infers it as an array. Cast at the
  // boundary; runtime shape is { skills: { id, name } } per row.
  const rawRows = (rows ?? []) as unknown as RawRow[];
  const pending = rawRows.map(toMember);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · review queue</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              Pending alumni profiles
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              {pending.length} awaiting review.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
          >
            ← Admin home
          </Link>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center text-text-muted text-[0.85rem]">
            Nothing pending. The queue is clear.
          </div>
        ) : (
          <UsersReview items={pending} />
        )}
      </div>
    </div>
  );
}

type RawRow = {
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

function toMember(r: RawRow) {
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
    createdAt: r.created_at,
    skills:  r.profile_skills.map((s)  => s.skills?.name).filter((n): n is string => !!n),
    sectors: r.profile_sectors.map((s) => s.sectors?.name).filter((n): n is string => !!n),
  };
}

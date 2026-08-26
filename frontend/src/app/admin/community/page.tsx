import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CommunityAdminClient from "./CommunityAdminClient";
import type { UserStatus } from "@/lib/database.overrides";

export default async function AdminCommunityPage() {
  const supabase = await createClient();

  // Admin RLS lets us read every profile. Pull everything we need for
  // search, filtering, and display in one query (joins for skills +
  // sectors so the admin filter panel mirrors the user-side one).
  const { data: rows, error } = await supabase
    .from("profiles")
    .select(`
      id,
      first_name,
      surname,
      role,
      status,
      course,
      grad_year,
      created_at,
      profile_skills ( skills ( id, name ) ),
      profile_sectors ( sectors ( id, name ) )
    `)
    .order("created_at", { ascending: false });

  if (error) console.error("Failed to load community list:", error);

  const profiles = (rows ?? []) as unknown as RawJoinRow[];

  const { data: emailRows } = await supabase
    .rpc("admin_get_signup_emails", { p_user_ids: profiles.map((p) => p.id) });

  const emailByUser = new Map<string, string>();
  for (const r of (emailRows ?? []) as { user_id: string; email: string }[]) {
    emailByUser.set(r.user_id, r.email);
  }

  const members = profiles.map((p) => ({
    id:        p.id,
    firstName: p.first_name,
    surname:   p.surname,
    role:      p.role,
    status:    p.status,
    course:    p.course,
    gradYear:  p.grad_year,
    email:     emailByUser.get(p.id) ?? null,
    createdAt: p.created_at,
    skills:    p.profile_skills.map((s)  => s.skills?.name).filter((n): n is string => !!n),
    sectors:   p.profile_sectors.map((s) => s.sectors?.name).filter((n): n is string => !!n),
  }));

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Admin · community</div>
            <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
              All members
            </h1>
            <p className="text-[0.85rem] text-text-muted mt-2">
              {members.length} total. Filter by role, status, course, year, interests, or skills. Deletion is permanent and notifies the user by email.
            </p>
          </div>
          <Link
            href="/admin"
            className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
          >
            ← Admin home
          </Link>
        </div>

        <CommunityAdminClient members={members} />
      </div>
    </div>
  );
}

type RawJoinRow = {
  id: string;
  first_name: string;
  surname: string;
  role: "alum" | "student";
  status: UserStatus;
  course: string | null;
  grad_year: number | null;
  created_at: string;
  profile_skills:  { skills:  { id: number; name: string } | null }[];
  profile_sectors: { sectors: { id: number; name: string } | null }[];
};

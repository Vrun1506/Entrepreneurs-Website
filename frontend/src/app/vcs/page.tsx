import Link from "next/link";
import AppNav from "@/components/AppNav";
import SubmittedBanner from "@/components/SubmittedBanner";
import { requireApprovedUser } from "@/lib/auth/guard";
import VcsClient from "./VcsClient";

type ActionRow = {
  listing_kind: "opportunity" | "event" | "vc_grant";
  listing_id:   string;
  action_type:  "applied" | "going";
  created_at:   string;
};

export default async function VcsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, isAdmin } = await requireApprovedUser();
  const justSubmitted = (await searchParams)?.submitted === "1";

  const [vcsRes, actionsRes] = await Promise.all([
    supabase
      .from("vcs_grants")
      .select(`
        id, kind, name, description, link,
        amount, deadline, stage,
        posted_by, created_at,
        profiles:posted_by ( first_name, surname )
      `)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_my_listing_actions"),
  ]);

  if (vcsRes.error) console.error("Failed to load vcs_grants:", vcsRes.error);
  if (actionsRes.error) console.error("Failed to load listing actions:", actionsRes.error);

  const items = ((vcsRes.data ?? []) as unknown as RawRow[]).map(toVc);
  const appliedIds = ((actionsRes.data ?? []) as ActionRow[])
    .filter((a) => a.listing_kind === "vc_grant" && a.action_type === "applied")
    .map((a) => a.listing_id);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="vcs" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          {justSubmitted && <SubmittedBanner kind="VC/grant" />}
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Grants & VCs</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Funding for Foundry founders
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
                {items.length} active listing{items.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href="/vcs/new"
              className="px-4 py-2 rounded-full bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors duration-150 hover:bg-gold-light"
            >
              Suggest a VC or grant →
            </Link>
          </div>
          <VcsClient items={items} appliedIds={appliedIds} />
        </div>
      </main>
    </div>
  );
}

type RawRow = {
  id: string;
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
  posted_by: string;
  created_at: string;
  profiles: { first_name: string; surname: string } | null;
};

function toVc(r: RawRow) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    link: r.link,
    amount: r.amount,
    deadline: r.deadline,
    stage: r.stage,
    postedBy: {
      firstName: r.profiles?.first_name ?? "",
      surname:   r.profiles?.surname    ?? "",
    },
  };
}

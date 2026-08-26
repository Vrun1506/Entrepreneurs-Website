import ListingPageShell from "@/components/ListingPageShell";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedListingIds } from "@/lib/listings/actionRow";
import VcsClient from "./VcsClient";

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

  // The double-cast survives the move to generated types on purpose. supabase-js
  // infers an embedded relation as an array, but PostgREST returns a single
  // object for a many-to-one FK like posted_by — and the multi-line select
  // string also defeats its type-level parser, degrading every scalar to `any`.
  // Same discrepancy documented in app/community/page.tsx. The real fix is to
  // serve this list from a flat RPC like list_approved_opportunities/_events
  // already do; /vcs is the last listing page still selecting with a join.
  const items = ((vcsRes.data ?? []) as unknown as RawRow[]).map(toVc);
  const appliedIds = markedListingIds(actionsRes.data, "vc_grant", "applied");

  return (
    <ListingPageShell
      active="vcs"
      isAdmin={isAdmin}
      justSubmitted={justSubmitted}
      submittedKind="VC/grant"
      eyebrow="Grants & VCs"
      title="Funding for Foundry founders"
      summary={`${items.length} active listing${items.length === 1 ? "" : "s"}.`}
      cta={{ href: "/vcs/new", label: "Suggest a VC or grant →" }}
    >
      <VcsClient items={items} appliedIds={appliedIds} />
    </ListingPageShell>
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

import { redirect } from "next/navigation";

// ════════════════════════════════════════════════════════════════════
// Foundry · /community → /members
//
// This route was the member directory. It has been renamed to /members,
// which is what it actually is, freeing the name /community for the post
// feed the prototype specifies — a different thing entirely.
//
// 307, not 308. A permanent redirect would be cached by browsers and
// intermediaries, and we intend to serve real content from /community
// again once the feed exists. A cached 308 would make that route
// unreachable for anyone who had visited it in between.
//
// The query string is carried across because directory filters live in
// the URL by design — a filtered view is a link you can send someone, and
// those links are already in people's messages.
// ════════════════════════════════════════════════════════════════════

export default async function CommunityRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value !== undefined) {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  redirect(query ? `/members?${query}` : "/members");
}

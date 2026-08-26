"use server";

import { revalidatePath } from "next/cache";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { invalidate } from "@/lib/cache";

// ProfileForm and OnboardingForm call update_profile / submit_onboarding
// straight from the browser, so no server action runs on that write and
// nothing gets the chance to drop the cached directory. Without this the
// member would edit their profile, land on /community, and see their old
// details until the 60s TTL expired — precisely the kind of staleness a
// TTL alone is a poor answer to.
//
// Routing those two writes through server actions is the real fix and is
// part of the backend migration; until then the form calls this on
// success.
//
// Safe to expose: it takes no input, requires a session, and its only
// effect is to make the next directory read go to Postgres.
export async function invalidateDirectoryCache(): Promise<void> {
  const { user } = await getActionAuth();
  if (!user) return;

  await invalidate("directoryFacets");
  revalidatePath("/community");
}

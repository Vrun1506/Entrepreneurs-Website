"use server";

import { cookies } from "next/headers";

// Clear the recovery marker set by /auth/callback once the password is set.
// Path-scoped to match how it was written; it also self-expires after 10
// minutes and is useless without a live session, so this is belt-and-braces.
export async function clearRecoveryMarker() {
  const cookieStore = await cookies();
  cookieStore.set("pw-recovery", "", { httpOnly: true, path: "/reset-password", maxAge: 0 });
}

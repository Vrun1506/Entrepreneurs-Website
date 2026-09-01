import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSkillsDetailed, listSectors } from "@/lib/data/taxonomy";
import { newestMembers } from "@/lib/data/directory";
import { signedImageUrls, signedCvUrl } from "@/lib/storage/blobRead";
import { destinationForStatus } from "@/lib/auth/status";
import IntakeFlow from "@/components/intake/IntakeFlow";

// ════════════════════════════════════════════════════════════════════
// Foundry · Post-approval intake
//
// Identity is already done — this only ever mounts for an approved
// member who hasn't completed it (profile_version < 2). Admins bypass
// both checks so they can preview the flow for diagnostics, matching
// every other status-gated page in the app.
// ════════════════════════════════════════════════════════════════════

export const metadata = { robots: { index: false, follow: false } };

export default async function IntakePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // cv_path and cv_original_filename are deliberately not in the profiles
  // table's SELECT grant (20260901000009) — a raw .select() naming them
  // fails the whole query with "permission denied for table profiles",
  // not just those two columns. get_my_cv_info() is the one legitimate
  // way back in, same as profile/page.tsx and mediaActions.ts use.
  const [profileRes, isAdminRes, cvInfoRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("status, profile_version, first_name, avatar_path")
      .eq("id", user.id)
      .single(),
    supabase.rpc("is_admin"),
    supabase.rpc("get_my_cv_info").maybeSingle(),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/login");
  const isAdmin = !!isAdminRes.data;
  const cvInfo = cvInfoRes.data;

  if (!isAdmin) {
    if (profile.status !== "approved") redirect(destinationForStatus(profile.status));
    if ((profile.profile_version ?? 1) >= 2) redirect("/home");
  }

  // A member arriving here mid-flow (or after a refresh) has often already
  // uploaded an avatar and/or CV — confirm_avatar_upload/confirm_cv_upload
  // write those columns the moment the upload finishes, well before the
  // rest of the intake is submitted. Signing them here lets the flow open
  // already showing "uploaded" instead of blank, with no client-side cache
  // of the bytes needed at all.
  const [skillTaxonomy, sectors, matches, existingAvatarUrl, existingCvUrl] = await Promise.all([
    listSkillsDetailed(supabase),
    listSectors(supabase),
    newestMembers(supabase, 3),
    profile.avatar_path
      ? signedImageUrls([profile.avatar_path], "profile_picture").then((urls) => urls[0] ?? null)
      : null,
    cvInfo?.cv_path ? signedCvUrl(cvInfo.cv_path) : null,
  ]);

  return (
    <IntakeFlow
      memberId={user.id}
      firstName={profile.first_name}
      skillTaxonomy={skillTaxonomy.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
      sectors={sectors}
      matches={matches}
      existingAvatarUrl={existingAvatarUrl}
      existingCv={
        cvInfo?.cv_path
          ? { blobKey: cvInfo.cv_path, filename: cvInfo.cv_original_filename ?? "Your CV", downloadUrl: existingCvUrl }
          : null
      }
    />
  );
}

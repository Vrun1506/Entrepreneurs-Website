import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Allowed Imperial email domains for Microsoft sign-in. Kept in sync with
// the DB trigger in migration 20260527000006.
const IMPERIAL_DOMAINS = ["ic.ac.uk", "imperial.ac.uk"];

const NON_IMPERIAL_MSG =
  "Microsoft sign-in is restricted to Imperial College London accounts (@ic.ac.uk or @imperial.ac.uk). Please use your Imperial email address.";

function isImperialEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && IMPERIAL_DOMAINS.includes(domain);
}

// OAuth providers redirect here with ?code=... after authorization.
// We exchange the code for a session and route based on admin status +
// profile state. Microsoft signups also pass an Imperial-domain gate;
// see migration 20260527000006 for the matching DB-layer enforcement.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  // Provider-side error (user cancelled, or our DB trigger rejected them
  // for not being an Imperial account).
  const providerError =
    searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    const friendly = providerError.includes("Imperial College London")
      ? NON_IMPERIAL_MSG
      : providerError;
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(friendly)}`,
    );
  }

  const code = searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data?.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError?.message ?? "exchange_failed")}`,
    );
  }

  const user = data.user;
  const provider = user.app_metadata?.provider;

  // Defence in depth: trigger blocks new non-Imperial Azure signups, but
  // a pre-existing auth.users row (created before the trigger restriction)
  // would still be allowed through. Kick them here.
  if (provider === "azure" && !isImperialEmail(user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(NON_IMPERIAL_MSG)}`,
    );
  }

  // Admins always go to /admin regardless of profile status.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin) return NextResponse.redirect(`${origin}/admin`);

  // Everyone else routes by their onboarding/review status.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  const dest = routeForStatus(profile?.status);
  return NextResponse.redirect(`${origin}${dest}`);
}

function routeForStatus(status: string | null | undefined): string {
  switch (status) {
    case "pending_onboarding": return "/onboarding";
    case "pending_review":     return "/pending";
    case "approved":           return "/community";
    case "rejected":           return "/rejected";
    default:                   return "/";
  }
}

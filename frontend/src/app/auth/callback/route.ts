import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles two paths:
//   1. Google OAuth (alumni) — exchanges the ?code= for a session.
//   2. Magic-link verification (students) — same code-exchange flow.
//
// Imperial domain enforcement for student magic-link signups lives in the
// DB trigger (see migration 20260529000001); we just relay any failure
// message back to /login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const providerError =
    searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(providerError)}`,
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

  // Admins always go to /admin regardless of profile status.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin) return NextResponse.redirect(`${origin}/admin`);

  // Everyone else routes by their onboarding/review status.
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
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

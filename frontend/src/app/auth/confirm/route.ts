import { NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { destinationForStatus } from "@/lib/auth/status";

// Email verification via token_hash (NOT the PKCE code flow in /auth/callback).
//
// PKCE stores a code-verifier in the originating browser, so a confirmation
// link opened in a *different* browser (e.g. the OS default browser, or an
// in-app email webview) can't complete `exchangeCodeForSession`. verifyOtp with
// a token_hash needs no verifier, so the link works from any browser — the
// session is created in whichever browser clicks it.
//
// Pointed at by the "Confirm signup" + "Magic Link" email templates, which use
// `type=email`. Google OAuth keeps using /auth/callback (PKCE, same-browser by
// nature). Imperial domain enforcement still lives in the DB trigger
// (migration 20260529000001); we just relay any failure back to /login.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const providerError =
    searchParams.get("error_description") || searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(providerError)}`,
    );
  }

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }
  // Our templates only ever send `email`. Reject anything else so this route
  // can never be coerced into processing a recovery/email_change token.
  if (type !== "email") {
    return NextResponse.redirect(`${origin}/login?error=invalid_type`);
  }

  const supabase = await createClient();
  const { data, error: verifyError } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });
  if (verifyError || !data?.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(verifyError?.message ?? "verify_failed")}`,
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

  return NextResponse.redirect(`${origin}${destinationForStatus(profile?.status)}`);
}

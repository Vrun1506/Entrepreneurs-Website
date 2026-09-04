import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// ════════════════════════════════════════════════════════════════════
// Foundry · Health check for external uptime monitoring
//
// A plain "the Next.js process is up" check is useless here — Vercel
// itself already reports that. What an external monitor actually needs
// to catch is a paused/suspended Supabase project (the free-tier
// database goes to sleep after a week of no traffic), which looks
// identical to "the site is up" from outside unless something on this
// route actually touches the database. Unauthenticated by design: an
// uptime monitor has no credentials, and this leaks nothing beyond
// "the DB answered a trivial query".
// ════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { error } = await createServiceClient()
      .from("app_config")
      .select("key")
      .limit(1);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}

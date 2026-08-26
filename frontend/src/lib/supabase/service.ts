import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.overrides";

// ════════════════════════════════════════════════════════════════════
// Service-role Supabase client. RLS-bypassing. Server-side only.
//
// Used by cron / webhook routes that need to read or mutate tables
// that are deliberately RLS-locked away from authenticated callers
// (outbound_email, app_config). The route's own request-level auth
// (e.g. Bearer CRON_SECRET) is the security boundary; once that
// passes, the service-role client gives unrestricted DB access.
//
// Never import from a client component. `server-only` will throw at
// build time if you do.
// ════════════════════════════════════════════════════════════════════

export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "foundry-cron" } },
  });
}

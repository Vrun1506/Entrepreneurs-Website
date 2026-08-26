import { createClient } from "@/lib/supabase/client";

// One browser Supabase client for the whole tab.
//
// createClient() builds a fresh client (and its own auth-state
// listener) on every call, so the modules that fire client-direct RPCs
// each kept a private lazy singleton. They kept the same one, twice —
// this is that singleton, hoisted.
//
// Lazy rather than module-scope: creating it at import time would run
// during SSR of any module that touches these helpers.

let cached: ReturnType<typeof createClient> | null = null;

export function browserClient() {
  if (!cached) cached = createClient();
  return cached;
}

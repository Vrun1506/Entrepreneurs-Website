import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// Auth context for server *actions* (not pages). Pages use guard.ts's
// requireApprovedUser, which redirect()s on failure — wrong for a form
// submit, where we want to return an err Result and show it inline.
//
// This returns the resolved identity so each action can decide what it
// needs (signed-in vs approved vs admin) and return a clean error.

export type ActionAuth = {
  supabase: SupabaseClient;
  user: User | null;
  isAdmin: boolean;
  status: "pending_onboarding" | "pending_review" | "approved" | "rejected" | null;
};

export async function getActionAuth(): Promise<ActionAuth> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false, status: null };

  const [{ data: isAdmin }, { data: profile }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
  ]);

  return {
    supabase,
    user,
    isAdmin: !!isAdmin,
    status: (profile?.status ?? null) as ActionAuth["status"],
  };
}

// Explicit admin gate for admin-only server actions. The underlying
// SECURITY DEFINER RPCs already enforce is_admin(); this is defence in
// depth + a clean error message instead of a raw RPC exception leaking
// to a non-admin caller.
export async function requireAdmin(): Promise<
  { ok: true; supabase: SupabaseClient } | { ok: false; error: string }
> {
  const { user, isAdmin, supabase } = await getActionAuth();
  if (!user) return { ok: false, error: "You must be signed in." };
  if (!isAdmin) return { ok: false, error: "Admin access required." };
  return { ok: true, supabase };
}

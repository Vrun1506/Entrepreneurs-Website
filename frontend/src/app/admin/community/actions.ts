"use server";

import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { sendAccountRemovalEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type Result = { ok: true } | { ok: false; error: string };

export async function adminDeleteUser(userId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A reason is required." };

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("admin_delete_user", {
    p_user_id: userId,
    p_reason:  trimmed,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    console.warn("admin_delete_user returned no email for user:", userId);
    // Membership changed, so the cached directory is stale.
    await invalidate("directory");
    revalidatePath("/admin/community");
    return { ok: true };
  }

  try {
    await sendAccountRemovalEmail({
      to:        row.email,
      firstName: row.first_name ?? null,
      reason:    trimmed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Membership changed, so the cached directory is stale.
    await invalidate("directory");
    revalidatePath("/admin/community");
    return { ok: false, error: `User deleted, but email failed to send: ${msg}` };
  }
  // Membership changed, so the cached directory is stale.
  await invalidate("directory");
  revalidatePath("/admin/community");
  return { ok: true };
}

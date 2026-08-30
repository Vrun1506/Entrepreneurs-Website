"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { ok, err, type Result } from "@/lib/result";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { sendReportOutcomeEmail } from "@/lib/email";

// ════════════════════════════════════════════════════════════════════
// Foundry · Resolving a report
//
// Closing a report ALWAYS tells the reporter what happened, for both
// outcomes. That is the half of a complaints process which is easiest to
// skip and the half that makes it real: a report route that never reports
// back trains members to stop using it, and leaves us holding a
// documented notification with no evidence we acted on it.
//
// "We looked and took no action" is a result. Silence is not.
// ════════════════════════════════════════════════════════════════════

export async function resolveReport(
  reportId: string,
  status: "actioned" | "dismissed",
  note: string,
): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return err(auth.error);

  const trimmed = note.trim();
  const { data, error } = await auth.supabase.rpc("admin_resolve_post_report", {
    p_report_id: reportId,
    p_status: status,
    p_note: trimmed || undefined,
  });
  if (error) return err(describeSupabaseError(error));

  const row = Array.isArray(data) ? data[0] : data;

  // reporter_id is nullable — someone can close their account between
  // reporting and an admin getting to it. Nothing to send, nothing wrong.
  if (!row?.email) {
    revalidatePath("/admin/reports");
    return ok();
  }

  try {
    await sendReportOutcomeEmail({
      to: row.email,
      firstName: row.first_name ?? null,
      postTitle: row.post_title,
      outcome: status,
      note: trimmed || null,
    });
  } catch (e) {
    // The report is resolved either way; only the notice failed. Reported
    // honestly rather than pretending the resolution didn't happen.
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/admin/reports");
    return err(`Report resolved, but the outcome email failed to send: ${msg}`);
  }

  revalidatePath("/admin/reports");
  return ok();
}

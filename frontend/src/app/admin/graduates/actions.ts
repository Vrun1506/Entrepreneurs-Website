"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { invalidate } from "@/lib/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { enqueueEmailsBulk, renderGraduationEmail } from "@/lib/email";
import { emailBaseUrl } from "@/lib/siteUrl";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type PreviewResult =
  | { ok: true; count: number; sample: { id: string; firstName: string; surname: string; gradYear: number }[] }
  | { ok: false; error: string };

export async function previewGraduates(cutoffYear: number): Promise<PreviewResult> {
  if (!Number.isFinite(cutoffYear) || cutoffYear < 1950 || cutoffYear > 2099) {
    return { ok: false, error: "Cutoff year must be between 1950 and 2099." };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  // Admin RLS lets us read every profile. No mutation here — this is
  // just a count + sample for the confirm modal.
  const { data, error, count } = await supabase
    .from("profiles")
    .select("id, first_name, surname, grad_year", { count: "exact" })
    .eq("role", "student")
    .eq("status", "approved")
    .not("grad_year", "is", null)
    .lte("grad_year", cutoffYear)
    .order("grad_year", { ascending: true })
    .limit(20);

  if (error) return { ok: false, error: describeSupabaseError(error) };

  const sample = (data ?? []).map((r) => ({
    id:        r.id as string,
    firstName: r.first_name as string,
    surname:   r.surname as string,
    gradYear:  r.grad_year as number,
  }));

  return { ok: true, count: count ?? 0, sample };
}

type DeleteResult =
  | { ok: true; deleted: number; emailsQueued: number }
  | { ok: false; error: string };

export async function deleteGraduates(cutoffYear: number): Promise<DeleteResult> {
  if (!Number.isFinite(cutoffYear) || cutoffYear < 1950 || cutoffYear > 2099) {
    return { ok: false, error: "Cutoff year must be between 1950 and 2099." };
  }

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("admin_delete_graduates", {
    p_cutoff_year: cutoffYear,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };

  const rows = (data ?? []) as { user_id: string; email: string | null; first_name: string | null }[];

  // Build the alum signup link from trusted config, NOT request headers
  // (x-forwarded-host is attacker-controllable → email-link poisoning).
  const alumSignupUrl = `${emailBaseUrl()}/login?role=alum`;

  // Render and bulk-enqueue rather than looping inline sends. A 200-grad
  // cohort would otherwise both blow past Vercel's function timeout
  // and burn through Resend's per-second rate. The cron drainer
  // dispatches them at a controlled pace.
  const enqueueRows = rows
    .filter((r): r is { user_id: string; email: string; first_name: string | null } => Boolean(r.email))
    .map((r) => {
      const { subject, text, html } = renderGraduationEmail({
        firstName:     r.first_name,
        alumSignupUrl,
      });
      return { to: r.email, subject, text, html };
    });

  let emailsQueued = 0;
  if (enqueueRows.length > 0) {
    try {
      emailsQueued = await enqueueEmailsBulk(enqueueRows);
    } catch (e) {
      // Accounts are already deleted; queue failure is a partial-state
      // event. Surface the error to the admin so they can investigate,
      // but report the deletion count accurately.
      Sentry.captureException(e, { level: "error", tags: { surface: "admin", path: "delete-graduates-email" } });
      const msg = e instanceof Error ? e.message : String(e);
      // Membership changed, so the cached directory is stale.
      await invalidate("directoryFacets");
      revalidatePath("/admin");
      revalidatePath("/admin/members");
      revalidatePath("/members");
      return {
        ok: false,
        error: `Deleted ${rows.length} accounts, but queueing congratulations emails failed: ${msg}. Run the queue diagnostics from /admin and contact affected graduates manually if needed.`,
      };
    }
  }
  // Membership changed, so the cached directory is stale.
  await invalidate("directoryFacets");
  revalidatePath("/admin");
  revalidatePath("/admin/members");
  revalidatePath("/members");

  return { ok: true, deleted: rows.length, emailsQueued };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { sendContactTicket } from "@/lib/email";
import { contactSchema } from "@/lib/validation/contact";
import { validate } from "@/lib/validation/listings";
import { allow } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";

type Result = { ok: true } | { ok: false; error: string };

export async function submitContactTicket(input: unknown): Promise<Result> {
  const parsed = validate(contactSchema, input);
  if (!parsed.ok) return parsed;
  const { subject, message } = parsed.data;
  const token = (input as { turnstileToken?: string } | null)?.turnstileToken;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "You must be signed in to contact the team." };

  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "Verification failed. Please complete the challenge and try again." };
  }
  if (!(await allow("submit", user.id))) {
    return { ok: false, error: "You're sending messages too frequently. Please try again later." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, surname")
    .eq("id", user.id)
    .single();

  try {
    await sendContactTicket({
      fromEmail: user.email,
      firstName: profile?.first_name ?? null,
      surname: profile?.surname ?? null,
      subject,
      message,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return { ok: true };
}

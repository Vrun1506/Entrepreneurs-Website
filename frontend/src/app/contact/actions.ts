"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendContactConfirmation, sendContactTicket } from "@/lib/email";
import { contactSchema } from "@/lib/validation/contact";
import { validate } from "@/lib/validation/listings";
import { allow, clientIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";

type Result = { ok: true } | { ok: false; error: string };

// Public contact form: anyone (member or not) can reach the society here.
// Spam is held off by Turnstile + the Upstash `submit` bucket, not an auth
// wall — that's what those layers are for. See tasks/WIRING_CHECKLIST.md §5b.
export async function submitContactTicket(input: unknown): Promise<Result> {
  const parsed = validate(contactSchema, input);
  if (!parsed.ok) return parsed;
  const { name, email, subject, message } = parsed.data;
  const token = (input as { turnstileToken?: string } | null)?.turnstileToken;

  if (!(await verifyTurnstile(token))) {
    return { ok: false, error: "Verification failed. Please complete the challenge and try again." };
  }

  // Rate-limit identity: per-user when signed in (NAT-safe), else per-IP.
  // Anonymous campus visitors share one public IP, but contact volume is
  // low and the 60/min/IP middleware bucket is the coarse backstop.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const rlKey = user?.id ?? clientIp(await headers());
  if (!(await allow("submit", rlKey))) {
    return { ok: false, error: "You're sending messages too frequently. Please try again later." };
  }

  try {
    await sendContactTicket({
      fromEmail: email,
      firstName: name?.trim() || null,
      surname: null,
      subject,
      message,
    });
  } catch (e) {
    // Public endpoint: never surface the underlying error text (it can carry
    // DB/network internals). Log server-side for diagnosis; return a generic
    // message the form shows verbatim.
    console.error("submitContactTicket: enqueue failed", e);
    return { ok: false, error: "Something went wrong sending your message. Please try again shortly." };
  }

  // Best-effort acknowledgement to the sender — only for signed-in members,
  // whose `email` is their own verified account address. Anonymous visitors
  // supply an arbitrary email, so auto-replying to it would be a reflective
  // spam vector (attacker submits a victim's address, victim gets the mail).
  // The ticket already reached the team above either way; a hiccup here must
  // not fail the request or prompt a retry.
  if (user) {
    try {
      await sendContactConfirmation({
        to: email,
        firstName: name?.trim() || null,
        subject,
      });
    } catch (e) {
      console.error("submitContactTicket: confirmation enqueue failed", e);
    }
  }

  return { ok: true };
}

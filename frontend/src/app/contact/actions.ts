"use server";

import { createClient } from "@/lib/supabase/server";
import { sendContactTicket } from "@/lib/email";

type Result = { ok: true } | { ok: false; error: string };

export async function submitContactTicket(input: {
  subject: string;
  message: string;
}): Promise<Result> {
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (!subject) return { ok: false, error: "Please enter a subject." };
  if (subject.length > 150) return { ok: false, error: "Subject must be 150 characters or fewer." };
  if (!message) return { ok: false, error: "Please enter a message." };
  if (message.length > 4000) return { ok: false, error: "Message must be 4000 characters or fewer." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "You must be signed in to contact the team." };

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

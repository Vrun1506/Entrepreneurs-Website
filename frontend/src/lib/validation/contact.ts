import { z } from "zod";

export const contactSchema = z.object({
  // Optional sender name (public form). Logged-in members submit their
  // profile name instead; either way it's display-only in the ticket.
  name: z.string().trim().max(120, "Name must be 120 characters or fewer.").optional(),
  // Required reply-to address. zod's .email() rejects newlines/garbage, so
  // it's safe to pass straight into Resend's reply_to field downstream.
  email: z.string().trim().min(1, "Please enter your email.").email("Please enter a valid email address.").max(254, "Email must be 254 characters or fewer."),
  // Reaches the outbound message's Subject header (email.ts), so reject CR/LF
  // and other control characters — header-injection defence in depth, mirroring
  // the CRLF-safety the .email() check above gives the reply_to field.
  subject: z.string().trim().min(1, "Please enter a subject.").max(150, "Subject must be 150 characters or fewer.").regex(/^[^\x00-\x1f\x7f]+$/, "Subject can't contain line breaks or control characters."),
  message: z.string().trim().min(1, "Please enter a message.").max(4000, "Message must be 4000 characters or fewer."),
});

export type ContactPayload = z.infer<typeof contactSchema>;

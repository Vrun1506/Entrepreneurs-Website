import { z } from "zod";

export const contactSchema = z.object({
  subject: z.string().trim().min(1, "Please enter a subject.").max(150, "Subject must be 150 characters or fewer."),
  message: z.string().trim().min(1, "Please enter a message.").max(4000, "Message must be 4000 characters or fewer."),
});

export type ContactPayload = z.infer<typeof contactSchema>;

import { Resend } from "resend";

// Lazily constructed so a missing key fails the email send, not module load.
function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(key);
}

function fromAddress(): string {
  // Format expected: "Foundry <noreply@yourdomain>". Set RESEND_FROM in env.
  return process.env.RESEND_FROM ?? "Foundry <onboarding@resend.dev>";
}

export async function sendRejectionEmail(opts: {
  to: string;
  firstName: string | null;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const subject = "Your Foundry application";
  const text = [
    greeting,
    "",
    "Thank you for applying to Foundry, the private community for Imperial College London's startup ecosystem.",
    "",
    "After reviewing your application, we're unable to approve your membership at this time.",
    "",
    "If you believe this is a mistake or your circumstances have changed, please reply to this email and we'll take another look.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${greeting}</p>
      <p>Thank you for applying to <strong>Foundry</strong>, the private community for Imperial College London's startup ecosystem.</p>
      <p>After reviewing your application, we're unable to approve your membership at this time.</p>
      <p>If you believe this is a mistake or your circumstances have changed, please reply to this email and we'll take another look.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: opts.to,
    subject,
    text,
    html,
  });
  if (error) {
    // Surface to the caller — the admin will see this in the action result.
    throw new Error(`Resend send failed: ${error.message ?? String(error)}`);
  }
}

function contactInbox(): string {
  return process.env.CONTACT_INBOX_EMAIL ?? "imperial.founders@gmail.com";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendContactTicket(opts: {
  fromEmail: string;
  firstName: string | null;
  surname: string | null;
  subject: string;
  message: string;
}): Promise<void> {
  const fullName = [opts.firstName, opts.surname].filter(Boolean).join(" ").trim() || "—";
  const sentAt = new Date().toISOString();
  const subject = `[Foundry contact] ${opts.subject}`;

  const text = [
    `From:  ${fullName}`,
    `Email: ${opts.fromEmail}`,
    `Sent:  ${sentAt}`,
    "",
    "─────────────────────────",
    "",
    opts.message,
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <table style="border-collapse: collapse; margin: 0 0 20px; font-size: 14px;">
        <tr>
          <td style="color: #5a5855; padding: 2px 12px 2px 0;">From</td>
          <td style="color: #1a1a1a;"><strong>${escapeHtml(fullName)}</strong></td>
        </tr>
        <tr>
          <td style="color: #5a5855; padding: 2px 12px 2px 0;">Email</td>
          <td style="color: #1a1a1a;"><a href="mailto:${escapeHtml(opts.fromEmail)}" style="color: #1a1a1a;">${escapeHtml(opts.fromEmail)}</a></td>
        </tr>
        <tr>
          <td style="color: #5a5855; padding: 2px 12px 2px 0;">Sent</td>
          <td style="color: #1a1a1a;">${escapeHtml(sentAt)}</td>
        </tr>
      </table>
      <div style="white-space: pre-wrap; border-top: 1px solid #e5e5e5; padding-top: 16px;">${escapeHtml(opts.message)}</div>
    </div>
  `;

  const resend = getResend();
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: contactInbox(),
    replyTo: opts.fromEmail,
    subject,
    text,
    html,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message ?? String(error)}`);
  }
}

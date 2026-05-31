import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// ════════════════════════════════════════════════════════════════════
// Foundry · Outbound email
//
// Every send goes through the `outbound_email` queue table in Postgres
// and is dispatched by the pg_cron-driven drain route at
// /api/cron/drain-email (see migration 20260530000003). Reasons:
//
//   * Resend's free tier is 100/day and ~2 req/sec. Bursty paths (grad
//     cleanup, contact spike) cannot send inline without tripping
//     rate limits.
//   * Pure outbox pattern gives at-least-once delivery and one place
//     to centralise retry / backoff / permanent-failure handling.
//   * 5-minute drain cadence is well inside the latency tolerance
//     for every Foundry email (rejection notices, contact tickets,
//     graduation congrats). Auth / verification / OTP mail goes
//     through Supabase Auth SMTP, not this path.
//
// All inserts run via the service-role client. The user-JWT RPC path
// previously used here was open to abuse: any authenticated session
// could relay phishing email from the Foundry sending domain. The
// service-role client bypasses RLS on outbound_email and is gated by
// `server-only` at import time, so the only callers are server-side
// actions/routes that this module already trusts to construct vetted
// templates.
// ════════════════════════════════════════════════════════════════════

type EnqueueArgs = {
  to:      string;
  subject: string;
  text:    string;
  html:    string;
  replyTo?: string;
};

function contactInbox(): string {
  return process.env.CONTACT_INBOX_EMAIL ?? "imperial.founders@gmail.com";
}

// Reply-to address for messages a recipient might want to appeal:
// account rejection, account removal by admin, listing rejection.
// Falls back to the contact inbox so appeals always land somewhere
// monitored, even before APPEALS_EMAIL is configured.
function appealsInbox(): string {
  return process.env.APPEALS_EMAIL ?? contactInbox();
}

// ─── Enqueue helpers ────────────────────────────────────────────────
// Service-role insert. outbound_email has RLS deny-all for
// authenticated/anon; the service role bypasses RLS and writes
// directly. No SECURITY DEFINER RPC sits between us and the table any
// more, which removes the open-relay vector that existed when the RPC
// was granted to `authenticated`.
async function enqueueEmail(args: EnqueueArgs): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("outbound_email").insert({
    to_address: args.to,
    subject:    args.subject,
    text_body:  args.text,
    html_body:  args.html,
    reply_to:   args.replyTo ?? null,
  });
  if (error) {
    throw new Error(`Failed to queue outbound email: ${error.message}`);
  }
}

// Bulk insert for paths that produce many rows at once (graduate
// cleanup, currently). Same service-role path; one round trip per
// call. Callers are responsible for ensuring the action is admin-
// authorised before invoking this — historically that happens via the
// admin server action's underlying RPC raising 42501 for non-admins.
export async function enqueueEmailsBulk(rows: EnqueueArgs[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceClient();
  const payload = rows.map((r) => ({
    to_address: r.to,
    subject:    r.subject,
    text_body:  r.text,
    html_body:  r.html,
    reply_to:   r.replyTo ?? null,
  }));
  const { error, count } = await supabase
    .from("outbound_email")
    .insert(payload, { count: "exact" });
  if (error) {
    throw new Error(`Failed to bulk-queue outbound emails: ${error.message}`);
  }
  return count ?? rows.length;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Profile acceptance ─────────────────────────────────────────────
export async function sendAcceptanceEmail(opts: {
  to: string;
  firstName: string | null;
  communityUrl: string;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const subject = "You're in — welcome to Foundry";
  const text = [
    greeting,
    "",
    "Good news: your Foundry application has been approved. Welcome to the private community for Imperial College London's startup ecosystem.",
    "",
    "You can now sign in and:",
    "  • Browse the member directory and connect with fellow founders, operators and alumni",
    "  • See open roles posted by people in the community on the Opportunities page",
    "  • RSVP to upcoming events on the Events page",
    "  • Find live VCs and grants accepting applications on the VCs page",
    "  • Post your own opportunity, event or VC/grant for admin review",
    "",
    "Take a minute to fill out the rest of your profile — what you're working on, the sectors you care about, and your portfolio links. People can only find you for the things they know you do.",
    "",
    opts.communityUrl,
    "",
    "If you have any questions, just reply to this email.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Good news: your <strong>Foundry</strong> application has been approved. Welcome to the private community for Imperial College London's startup ecosystem.</p>
      <p>You can now sign in and:</p>
      <ul style="padding-left: 20px; margin: 12px 0;">
        <li>Browse the member directory and connect with fellow founders, operators and alumni</li>
        <li>See open roles posted by people in the community on the <strong>Opportunities</strong> page</li>
        <li>RSVP to upcoming events on the <strong>Events</strong> page</li>
        <li>Find live VCs and grants accepting applications on the <strong>VCs</strong> page</li>
        <li>Post your own opportunity, event or VC/grant for admin review</li>
      </ul>
      <p>Take a minute to fill out the rest of your profile — what you're working on, the sectors you care about, and your portfolio links. People can only find you for the things they know you do.</p>
      <p style="margin: 20px 0;">
        <a href="${escapeHtml(opts.communityUrl)}" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #c9a84c; color: #0c0c0b; text-decoration: none; font-weight: 500;">Open Foundry →</a>
      </p>
      <p>If you have any questions, just reply to this email.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  await enqueueEmail({ to: opts.to, subject, text, html });
}

// ─── Profile rejection ──────────────────────────────────────────────
export async function sendRejectionEmail(opts: {
  to: string;
  firstName: string | null;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
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
      <p>${escapeHtml(greeting)}</p>
      <p>Thank you for applying to <strong>Foundry</strong>, the private community for Imperial College London's startup ecosystem.</p>
      <p>After reviewing your application, we're unable to approve your membership at this time.</p>
      <p>If you believe this is a mistake or your circumstances have changed, please reply to this email and we'll take another look.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

// ─── Account removed by admin ───────────────────────────────────────
export async function sendAccountRemovalEmail(opts: {
  to: string;
  firstName: string | null;
  reason: string;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const subject = "Your Foundry account has been removed";
  const text = [
    greeting,
    "",
    "Your Foundry account has been removed by a community admin. Their note:",
    "",
    opts.reason,
    "",
    "All of your profile data, posted opportunities, events, and VC/grant submissions have been deleted from our systems.",
    "",
    "If you believe this is a mistake, please reply to this email and we'll review.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Your Foundry account has been removed by a community admin. Their note:</p>
      <blockquote style="margin: 16px 0; padding: 12px 16px; background: #f6f5f1; border-left: 3px solid #c9a84c; white-space: pre-wrap;">${escapeHtml(opts.reason)}</blockquote>
      <p>All of your profile data, posted opportunities, events, and VC/grant submissions have been deleted from our systems.</p>
      <p>If you believe this is a mistake, please reply to this email and we'll review.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

// ─── Graduation congrats + reapply-as-alum ──────────────────────────
// Two exports: the single-recipient helper for any future ad-hoc use,
// and a render helper used by the bulk-enqueue path in
// /admin/graduates/actions.ts so it can produce N rows without
// rebuilding the template logic.
export function renderGraduationEmail(opts: {
  firstName: string | null;
  alumSignupUrl: string;
}): { subject: string; text: string; html: string } {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const subject = "Congratulations on graduating from Imperial!";
  const text = [
    greeting,
    "",
    "Congratulations on graduating from Imperial College London — we wish you the very best for whatever you go on to build.",
    "",
    "Foundry's student community is for current Imperial students, so your account will be removed shortly. If you'd like to stay involved as an alum, you're warmly welcome to reapply for an alumni account using a personal email — just visit:",
    "",
    opts.alumSignupUrl,
    "",
    "Alumni applications are reviewed by an admin before access is granted; bring your strongest LinkedIn link.",
    "",
    "Thank you for being part of Foundry as a student — keep us posted on what you build next.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Congratulations on graduating from Imperial College London — we wish you the very best for whatever you go on to build.</p>
      <p>Foundry's student community is for current Imperial students, so your account will be removed shortly. If you'd like to stay involved as an alum, you're warmly welcome to reapply for an alumni account using a personal email:</p>
      <p style="margin: 16px 0;">
        <a href="${escapeHtml(opts.alumSignupUrl)}" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #c9a84c; color: #0c0c0b; text-decoration: none; font-weight: 500;">Apply as an alum →</a>
      </p>
      <p>Alumni applications are reviewed by an admin before access is granted; bring your strongest LinkedIn link.</p>
      <p>Thank you for being part of Foundry as a student — keep us posted on what you build next.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendGraduationEmail(opts: {
  to: string;
  firstName: string | null;
  alumSignupUrl: string;
}): Promise<void> {
  const { subject, text, html } = renderGraduationEmail({
    firstName:     opts.firstName,
    alumSignupUrl: opts.alumSignupUrl,
  });
  await enqueueEmail({ to: opts.to, subject, text, html });
}

// ─── Listing rejection ──────────────────────────────────────────────
type ListingKind = "opportunity" | "event" | "VC/grant submission";

export async function sendListingRejectionEmail(opts: {
  to: string;
  firstName: string | null;
  listingKind: ListingKind;
  listingTitle: string;
  reason: string;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const subject = `Your Foundry ${opts.listingKind} wasn't approved`;
  const articleAndKind = opts.listingKind === "opportunity"
    ? "your opportunity"
    : opts.listingKind === "event"
      ? "your event"
      : "your VC/grant submission";

  const text = [
    greeting,
    "",
    `Thanks for submitting ${articleAndKind} "${opts.listingTitle}" to Foundry.`,
    "",
    "After review, we weren't able to approve it. The reviewer's notes:",
    "",
    opts.reason,
    "",
    "If you'd like to update and resubmit, you're welcome to — most rejections come down to a missing detail or a small policy mismatch, both fixable. If you'd like to discuss the decision, reply to this email and we'll take another look.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Thanks for submitting ${articleAndKind} <strong>"${escapeHtml(opts.listingTitle)}"</strong> to Foundry.</p>
      <p>After review, we weren't able to approve it. The reviewer's notes:</p>
      <blockquote style="margin: 16px 0; padding: 12px 16px; background: #f6f5f1; border-left: 3px solid #c9a84c; white-space: pre-wrap;">${escapeHtml(opts.reason)}</blockquote>
      <p>If you'd like to update and resubmit, you're welcome to — most rejections come down to a missing detail or a small policy mismatch, both fixable. If you'd like to discuss the decision, reply to this email and we'll take another look.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

// ─── Contact form ───────────────────────────────────────────────────
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

  await enqueueEmail({
    to:      contactInbox(),
    replyTo: opts.fromEmail,
    subject,
    text,
    html,
  });
}

// ─── Name sanitiser ─────────────────────────────────────────────────
// Used in email greetings to defang anything weird in user-supplied
// names. Strips zero-width, normalises Unicode, collapses internal
// whitespace, trims, caps length.
function escapeName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 64 ? `${cleaned.slice(0, 64)}…` : cleaned;
}

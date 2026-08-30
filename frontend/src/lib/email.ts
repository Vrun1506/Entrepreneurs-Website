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
  return process.env.CONTACT_INBOX_EMAIL ?? "contact@imperialentrepreneurs.com";
}

// Reply-to address for messages a recipient might want to appeal:
// account rejection, account removal by admin, listing rejection.
// Falls back to the contact inbox so appeals always land somewhere
// monitored, even before APPEALS_EMAIL is configured.
function appealsInbox(): string {
  return process.env.APPEALS_EMAIL ?? "appeals@imperialentrepreneurs.com";
}

// Where a new content report lands. Falls back to the contact inbox so
// reports always reach somebody monitored, even before MODERATION_INBOX_EMAIL
// is configured — an unrouted report is the one failure this whole path
// exists to prevent.
function moderationInbox(): string {
  return process.env.MODERATION_INBOX_EMAIL ?? contactInbox();
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
// Rendered separately from sending, like renderGraduationEmail below, so
// the bulk approve path can build many of these and hand them to
// enqueueEmailsBulk in one round trip instead of one insert per member.
export function renderAcceptanceEmail(opts: {
  firstName: string | null;
  appUrl: string;
}): { subject: string; text: string; html: string } {
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
    opts.appUrl,
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
        <a href="${escapeHtml(opts.appUrl)}" style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #c9a84c; color: #0c0c0b; text-decoration: none; font-weight: 500;">Open Foundry →</a>
      </p>
      <p>If you have any questions, just reply to this email.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  return { subject, text, html };
}

export async function sendAcceptanceEmail(opts: {
  to: string;
  firstName: string | null;
  appUrl: string;
}): Promise<void> {
  const { subject, text, html } = renderAcceptanceEmail({
    firstName:    opts.firstName,
    appUrl: opts.appUrl,
  });
  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: contactInbox() });
}

/** Reply-to for the acceptance email, exported for the bulk path. */
export const acceptanceReplyTo = contactInbox;

// ─── Profile rejection ──────────────────────────────────────────────
export function renderRejectionEmail(opts: {
  firstName: string | null;
}): { subject: string; text: string; html: string } {
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

  return { subject, text, html };
}

export async function sendRejectionEmail(opts: {
  to: string;
  firstName: string | null;
}): Promise<void> {
  const { subject, text, html } = renderRejectionEmail({ firstName: opts.firstName });
  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

/** Reply-to for the rejection email, exported for the bulk path. */
export const rejectionReplyTo = appealsInbox;

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
  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: contactInbox() });
}

// ─── Listing rejection ──────────────────────────────────────────────
type ListingKind = "opportunity" | "event" | "VC/grant submission";

// Rendered separately from sending, like renderAcceptanceEmail above, so
// the bulk reject path can build many of these and hand them to
// enqueueEmailsBulk in one round trip instead of one insert per listing.
export function renderListingRejectionEmail(opts: {
  firstName: string | null;
  listingKind: ListingKind;
  listingTitle: string;
  reason: string;
}): { subject: string; text: string; html: string } {
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

  return { subject, text, html };
}

export async function sendListingRejectionEmail(opts: {
  to: string;
  firstName: string | null;
  listingKind: ListingKind;
  listingTitle: string;
  reason: string;
}): Promise<void> {
  const { subject, text, html } = renderListingRejectionEmail(opts);
  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

/** Reply-to for the listing rejection email, exported for the bulk path. */
export const listingRejectionReplyTo = appealsInbox;

// ─── Community post takedown ────────────────────────────────────────
// Sent when an admin removes a post. Four things have to be in here for
// the removal to be defensible, and one thing has to be left out.
//
// In: what was removed and when it was posted; that a person removed it
// and when; the reason; and how to appeal. A takedown a member cannot
// identify or contest is not moderation, it is just deletion.
//
// Out: the body of the post. Quoting back the content we have just
// destroyed would undercut the deletion — and the member wrote it, so
// they are the one person who does not need a copy.
//
// The 12-month retention line is deliberate too: telling someone a record
// is kept, and for how long, is the transparency half of relying on
// Article 17(3)(e) to keep it.
export function renderPostTakedownEmail(opts: {
  firstName: string | null;
  postTitle: string;
  postedAt: Date;
  reason: string;
}): { subject: string; text: string; html: string } {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const posted = opts.postedAt.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  const subject = "Your Foundry community post has been removed";

  const text = [
    greeting,
    "",
    `Your community post "${opts.postTitle}", published on ${posted}, has been removed by a Foundry admin. Their reason:`,
    "",
    opts.reason,
    "",
    "Posting guidelines are in our Terms of Use. We keep a record of removals like this one for 12 months.",
    "",
    "If you think this was a mistake, reply to this email and we'll review it.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Your community post &ldquo;${escapeHtml(opts.postTitle)}&rdquo;, published on ${escapeHtml(posted)}, has been removed by a Foundry admin. Their reason:</p>
      <blockquote style="margin: 16px 0; padding: 12px 16px; background: #f6f5f1; border-left: 3px solid #c9a84c; white-space: pre-wrap;">${escapeHtml(opts.reason)}</blockquote>
      <p>Posting guidelines are in our Terms of Use. We keep a record of removals like this one for 12 months.</p>
      <p>If you think this was a mistake, reply to this email and we&rsquo;ll review it.</p>
      <p style="color: #5a5855; margin-top: 32px;">&mdash; The Foundry team</p>
    </div>`;

  return { subject, text, html };
}

export async function sendPostTakedownEmail(opts: {
  to: string;
  firstName: string | null;
  postTitle: string;
  postedAt: Date;
  reason: string;
}): Promise<void> {
  const { subject, text, html } = renderPostTakedownEmail(opts);
  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

export const postTakedownReplyTo = appealsInbox;

// ─── Report outcome ─────────────────────────────────────────────────
// Closes the loop with whoever reported a post. This is the half of a
// complaints process that is easiest to skip and the half that makes it
// real: a report route that never reports back trains members to stop
// using it, and leaves us with a documented notification and no evidence
// we did anything about it.
//
// Sent for BOTH outcomes. "We looked and took no action" is a result;
// silence is not.
export function renderReportOutcomeEmail(opts: {
  firstName: string | null;
  postTitle: string;
  outcome: "actioned" | "dismissed";
  note: string | null;
}): { subject: string; text: string; html: string } {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const subject = "We've reviewed your Foundry report";

  const verdict =
    opts.outcome === "actioned"
      ? "We agreed, and the post has been removed."
      : "We reviewed it and decided it doesn't breach our posting guidelines, so it will stay up.";

  const text = [
    greeting,
    "",
    `Thanks for reporting the community post "${opts.postTitle}". An admin has now reviewed it.`,
    "",
    verdict,
    ...(opts.note ? ["", "They added:", "", opts.note] : []),
    "",
    "If you disagree with this outcome, reply to this email and we'll take another look.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Thanks for reporting the community post &ldquo;${escapeHtml(opts.postTitle)}&rdquo;. An admin has now reviewed it.</p>
      <p>${escapeHtml(verdict)}</p>
      ${opts.note
        ? `<p>They added:</p><blockquote style="margin: 16px 0; padding: 12px 16px; background: #f6f5f1; border-left: 3px solid #c9a84c; white-space: pre-wrap;">${escapeHtml(opts.note)}</blockquote>`
        : ""}
      <p>If you disagree with this outcome, reply to this email and we&rsquo;ll take another look.</p>
      <p style="color: #5a5855; margin-top: 32px;">&mdash; The Foundry team</p>
    </div>`;

  return { subject, text, html };
}

export async function sendReportOutcomeEmail(opts: {
  to: string;
  firstName: string | null;
  postTitle: string;
  outcome: "actioned" | "dismissed";
  note: string | null;
}): Promise<void> {
  const { subject, text, html } = renderReportOutcomeEmail(opts);
  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: appealsInbox() });
}

// ─── Contact form ───────────────────────────────────────────────────
// ─── New report notification (to us, not to a member) ───────────────
// The Online Safety Act asks a user-to-user service to act on illegal
// content once it knows about it, and knowing cannot depend on somebody
// remembering to open /admin/reports. This turns the queue from a page you
// have to visit into a message that arrives.
//
// Deliberately does NOT quote the reported post's body. The admin can read
// it in the app behind an admin session; putting members' content into an
// inbox spreads it further than the report asked us to.
export function renderPostReportEmail(opts: {
  category: string;
  reason: string;
  postTitle: string;
  reportedAt: Date;
  siteUrl: string;
}): { subject: string; text: string; html: string } {
  const when = opts.reportedAt.toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const queue = `${opts.siteUrl.replace(/\/$/, "")}/admin/reports`;
  // Category first, so severity is legible in a notification list without
  // opening anything.
  const subject = `[Foundry] Post reported — ${opts.category}`;

  const text = [
    `A member reported a community post on ${when}.`,
    "",
    `Category: ${opts.category}`,
    `Post:     "${opts.postTitle}"`,
    "",
    "What they said:",
    opts.reason,
    "",
    `Review it: ${queue}`,
    "",
    "The reporter is identified in the admin queue, not here.",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>A member reported a community post on ${escapeHtml(when)}.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 2px 12px 2px 0; color: #5a5855;">Category</td><td style="padding: 2px 0;"><strong>${escapeHtml(opts.category)}</strong></td></tr>
        <tr><td style="padding: 2px 12px 2px 0; color: #5a5855;">Post</td><td style="padding: 2px 0;">&ldquo;${escapeHtml(opts.postTitle)}&rdquo;</td></tr>
      </table>
      <p style="margin-bottom: 4px;">What they said:</p>
      <blockquote style="margin: 4px 0 16px; padding: 12px 16px; background: #f6f5f1; border-left: 3px solid #c9a84c; white-space: pre-wrap;">${escapeHtml(opts.reason)}</blockquote>
      <p><a href="${escapeHtml(queue)}" style="color: #1a1a1a;">Review it in the admin queue</a></p>
      <p style="color: #5a5855; font-size: 13px; margin-top: 24px;">The reporter is identified in the admin queue, not here.</p>
    </div>`;

  return { subject, text, html };
}

export async function sendPostReportEmail(opts: {
  category: string;
  reason: string;
  postTitle: string;
  reportedAt: Date;
  siteUrl: string;
}): Promise<void> {
  const { subject, text, html } = renderPostReportEmail(opts);
  await enqueueEmail({ to: moderationInbox(), subject, text, html });
}

export const postReportRecipient = moderationInbox;

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

// ─── Contact form — sender acknowledgement ──────────────────────────
// Auto-reply to the person who submitted the contact form so they know
// it went through. Sent best-effort by the action after the team ticket;
// Reply-To points at the contact inbox so a reply continues to the team.
export async function sendContactConfirmation(opts: {
  to: string;
  firstName: string | null;
  subject: string;
}): Promise<void> {
  const greeting = opts.firstName ? `Hi ${escapeName(opts.firstName)},` : "Hi,";
  const subject = "We've got your message — Foundry";
  const ref = opts.subject.trim();
  const text = [
    greeting,
    "",
    `Thanks for getting in touch with Foundry. We've received your message${ref ? ` about "${ref}"` : ""} and someone will get back to you as soon as we can.`,
    "",
    "If you need to add anything, just reply to this email.",
    "",
    "— The Foundry team",
  ].join("\n");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.6;">
      <p>${escapeHtml(greeting)}</p>
      <p>Thanks for getting in touch with <strong>Foundry</strong>. We've received your message${ref ? ` about <strong>"${escapeHtml(ref)}"</strong>` : ""} and someone will get back to you as soon as we can.</p>
      <p>If you need to add anything, just reply to this email.</p>
      <p style="color: #5a5855; margin-top: 32px;">— The Foundry team</p>
    </div>
  `;

  await enqueueEmail({ to: opts.to, subject, text, html, replyTo: contactInbox() });
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

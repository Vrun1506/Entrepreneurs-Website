import { describe, it, expect } from "vitest";
import { renderPostReportEmail } from "./email";

// The report notification is the only email on this project whose body is
// built from text a member typed with no review in between. Everything here
// is about that: the reason must survive as text, never as markup, and the
// message must carry enough for a moderator to triage without opening the
// app — while carrying nothing the report did not ask us to spread.

const base = {
  category: "harassment",
  reason: "Repeated targeted messages about a named student.",
  postTitle: "Looking for a cofounder",
  reportedAt: new Date("2026-08-30T14:05:00Z"),
  siteUrl: "https://www.imperialentrepreneurs.com",
};

describe("renderPostReportEmail", () => {
  it("escapes a reason that tries to inject markup", () => {
    const out = renderPostReportEmail({
      ...base,
      reason: '<img src=x onerror="alert(1)">and <b>bold</b>',
    });

    // What matters is that no live tag or attribute is formed. The word
    // "onerror" surviving as escaped text is correct — a moderator needs to
    // read what was actually posted, and `onerror=&quot;` cannot execute.
    expect(out.html).not.toContain("<img");
    expect(out.html).not.toContain('onerror="');
    expect(out.html).not.toContain("<b>bold</b>");
    expect(out.html).toContain("&lt;img");
    expect(out.html).toContain("onerror=&quot;");
    // The plain-text part is not markup, so it keeps the characters as typed —
    // that is what a moderator needs to see to judge what was reported.
    expect(out.text).toContain('<img src=x onerror="alert(1)">');
  });

  it("escapes a post title that tries the same thing", () => {
    const out = renderPostReportEmail({ ...base, postTitle: '"><script>alert(1)</script>' });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("leads the subject with the category, so severity reads in a notification list", () => {
    expect(renderPostReportEmail(base).subject).toBe("[Foundry] Post reported — harassment");
  });

  it("links to the admin queue without doubling the slash", () => {
    const out = renderPostReportEmail({ ...base, siteUrl: "https://example.com/" });
    expect(out.text).toContain("https://example.com/admin/reports");
    expect(out.html).toContain("https://example.com/admin/reports");
    expect(out.text).not.toContain("//admin/reports");
  });

  it("carries category, title and reason so triage needs no second lookup", () => {
    const out = renderPostReportEmail(base);
    for (const part of [base.category, base.postTitle, base.reason]) {
      expect(out.text).toContain(part);
      expect(out.html).toContain(part);
    }
  });

  it("does not name the reporter", () => {
    // Who reported what is in the admin queue, behind an admin session. An
    // inbox is a wider audience than the report asked for, and a reporter
    // identified in a forwardable email is a reporter who stops reporting.
    const out = renderPostReportEmail(base);
    expect(out.text.toLowerCase()).toContain("identified in the admin queue");
    expect(out.html.toLowerCase()).toContain("identified in the admin queue");
  });
});

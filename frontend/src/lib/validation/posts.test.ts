import { describe, it, expect } from "vitest";
import {
  postSchema,
  reportSchema,
  segmentPostBody,
  validatePost,
  POST_BODY_MAX,
  POST_TITLE_MAX,
} from "./posts";

const IMAGE = {
  blob_key: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.webp",
  alt_text: "A photo of the team",
  width: 800,
  height: 600,
  byte_size: 12345,
};

describe("postSchema", () => {
  it("accepts a plain text post with no images", () => {
    const res = validatePost(postSchema, { title: "Hello", body: "Something worth reading." });
    expect(res.ok).toBe(true);
  });

  it("rejects a body below the spam floor", () => {
    // "hi" is not a post. The column allows 1 character because a
    // constraint should not encode editorial policy; this layer does.
    const res = validatePost(postSchema, { title: "Hello", body: "hi" });
    expect(res).toMatchObject({ ok: false });
  });

  it.each([
    ["title", { title: "x".repeat(POST_TITLE_MAX + 1), body: "A body long enough." }],
    ["body", { title: "Fine", body: "x".repeat(POST_BODY_MAX + 1) }],
  ])("rejects an over-length %s", (_field, input) => {
    expect(validatePost(postSchema, input)).toMatchObject({ ok: false });
  });

  it("rejects more than two images", () => {
    const res = validatePost(postSchema, {
      title: "Three",
      body: "A body long enough.",
      images: [IMAGE, IMAGE, IMAGE],
    });
    expect(res).toMatchObject({ ok: false });
  });

  it("requires alt text on every image", () => {
    const res = validatePost(postSchema, {
      title: "No alt",
      body: "A body long enough.",
      images: [{ ...IMAGE, alt_text: "" }],
    });
    expect(res).toMatchObject({ ok: false });
  });

  it("rejects a blob key the app did not generate", () => {
    // Keys come from issue_upload_ticket as uuid + .webp. Anything else is
    // a client inventing a path, which must never reach the RPC.
    for (const bad of ["../../etc/passwd", "not-a-uuid.webp", "aaaa.png", ""]) {
      const res = validatePost(postSchema, {
        title: "Bad key",
        body: "A body long enough.",
        images: [{ ...IMAGE, blob_key: bad }],
      });
      expect(res, bad).toMatchObject({ ok: false });
    }
  });
});

describe("reportSchema", () => {
  it("rejects a category outside the fixed list", () => {
    const res = validatePost(reportSchema, {
      postId: "11111111-1111-1111-1111-111111111111",
      category: "made-up",
      reason: "Ten characters at least.",
    });
    expect(res).toMatchObject({ ok: false });
  });

  it("requires enough detail for an admin to act on", () => {
    const res = validatePost(reportSchema, {
      postId: "11111111-1111-1111-1111-111111111111",
      category: "spam",
      reason: "bad",
    });
    expect(res).toMatchObject({ ok: false });
  });
});

describe("segmentPostBody", () => {
  it("leaves a post with no links as a single text run", () => {
    expect(segmentPostBody("Just words here.")).toEqual([
      { kind: "text", text: "Just words here." },
    ]);
  });

  it("links http and https, and exposes the real hostname", () => {
    // The hostname is displayed in the UI so a link cannot claim one
    // destination and go to another — the mechanic of a phishing post.
    const segments = segmentPostBody("See https://imperial.ac.uk/apply for details");
    expect(segments).toContainEqual({
      kind: "link",
      href: "https://imperial.ac.uk/apply",
      host: "imperial.ac.uk",
    });
  });

  it.each([
    "javascript:alert(document.cookie)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("never links a %s URL", (hostile) => {
    // This is the line that stops a plain-text field becoming an XSS
    // vector the moment anything linkifies it.
    const segments = segmentPostBody(`Click ${hostile} now`);
    expect(segments.every((s) => s.kind === "text")).toBe(true);
  });

  it("does not swallow sentence punctuation into the href", () => {
    const segments = segmentPostBody("Go to https://example.com.");
    const link = segments.find((s) => s.kind === "link");
    expect(link).toMatchObject({ href: "https://example.com" });
    expect(segments.at(-1)).toEqual({ kind: "text", text: "." });
  });

  it("handles several links in one body", () => {
    const segments = segmentPostBody("https://a.com and https://b.com");
    expect(segments.filter((s) => s.kind === "link")).toHaveLength(2);
  });

  it("reassembles to the original text", () => {
    // Whatever the segmentation does, nothing may be lost or duplicated —
    // a member's words must survive rendering intact.
    const body = "Start https://x.com/path?q=1 middle (https://y.co) end.";
    const rebuilt = segmentPostBody(body)
      .map((s) => (s.kind === "text" ? s.text : s.href))
      .join("");
    expect(rebuilt).toBe(body);
  });
});

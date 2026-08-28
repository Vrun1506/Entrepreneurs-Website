"use client";

import Link from "next/link";
import { useState } from "react";

// T&C + Privacy agreement checkbox plus an expandable email-usage notice.
// Used by both the alumni signup form and the student verification-link
// signup flow. Parent owns the `agreed` state so it can gate the submit
// button.
export function SignupDisclosures({
  agreed, onChange,
}: {
  agreed: boolean;
  onChange: (v: boolean) => void;
}) {
  const [emailNoticeOpen, setEmailNoticeOpen] = useState(false);

  return (
    <div className="pt-1 space-y-3 border-t border-border-subtle mt-1">
      <label className="flex items-start gap-3 cursor-pointer select-none mt-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-[3px] w-4 h-4 shrink-0 accent-white cursor-pointer"
          aria-describedby="tc-disclosure"
        />
        <span id="tc-disclosure" className="text-[0.78rem] text-text-secondary leading-relaxed">
          By signing up to <span className="text-text-primary">Imperial Entrepreneurs</span>, you agree to our{" "}
          <Link href="/terms" target="_blank" className="text-accent hover:text-accent-light no-underline">
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="text-accent hover:text-accent-light no-underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <button
        type="button"
        onClick={() => setEmailNoticeOpen((o) => !o)}
        className="text-[0.72rem] text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer transition-colors flex items-center gap-1 pl-7"
      >
        <span>{emailNoticeOpen ? "▾" : "▸"}</span>
        How we&apos;ll use your email
      </button>

      {emailNoticeOpen && (
        <div className="pl-7 text-[0.72rem] text-text-muted leading-relaxed space-y-1.5">
          <p>We send a few transactional emails tied to your account:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Sign-in verification (student magic-link) and password reset (alumni).</li>
            <li>Admin decisions on your application and any opportunities, events, or VC/grants you post.</li>
            <li>Account or content removal notices, including the graduate-cleanup at the end of your final year.</li>
            <li>Replies from the team if you contact us via the in-app form.</li>
          </ul>
          <p className="pt-1">
            We don&apos;t send marketing emails or share your address with third parties. Your email is removed from our systems when you delete your account.
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

// Shown on a listing page after a successful submission (?submitted=1).
// The new listing is `pending` and so isn't on the public list yet —
// this reassures the poster and points them to /my-submissions.
export default function SubmittedBanner({ kind }: { kind: string }) {
  const [show, setShow] = useState(true);
  if (!show) return null;

  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border-l-2 border-accent bg-accent-muted px-5 py-4">
      <p className="text-[0.85rem] text-text-secondary leading-relaxed">
        Thanks — your {kind} was submitted and is now in review. It&apos;ll appear publicly once an admin approves it. Track it under{" "}
        <Link href="/my-submissions" className="text-text-primary underline underline-offset-[3px] decoration-border-strong transition-colors hover:decoration-accent">your submissions</Link>.
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-white/[0.04] leading-none text-text-muted cursor-pointer transition-colors duration-150 hover:border-accent hover:text-text-primary"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

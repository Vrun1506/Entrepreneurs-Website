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
    <div className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-gold/25 bg-gold/[0.06] px-5 py-4">
      <p className="text-[0.85rem] text-text-secondary leading-relaxed">
        Thanks — your {kind} was submitted and is now in review. It&apos;ll appear publicly once an admin approves it. Track it under{" "}
        <Link href="/my-submissions" className="text-gold-light hover:underline">your submissions</Link>.
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="shrink-0 -m-1 p-1 bg-transparent border-0 cursor-pointer text-text-muted hover:text-text-primary text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

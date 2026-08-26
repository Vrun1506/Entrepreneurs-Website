"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where you'd ship the error to monitoring
    // (Sentry / Datadog / etc.). For now, just log so it shows in dev.
    console.error(error);
  }, [error]);

  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[15%] -right-[10%] w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 65%)" }}
      />

      <main id="main-content" tabIndex={-1} className="relative z-10 flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[560px] text-center">
          <div className="font-display text-gold text-[clamp(4rem,12vw,8rem)] leading-none mb-4">
            Oops
          </div>

          <h1 className="font-display text-text-primary leading-[1.15] tracking-tight mb-5 text-[clamp(1.75rem,3.5vw,2.5rem)]">
            Something went wrong.
          </h1>

          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.7] mb-10">
            An unexpected error stopped the page from loading. You can try again,
            or head back home.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-gold text-bg-primary text-sm font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px"
            >
              Try again
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full no-underline bg-transparent text-text-secondary border border-border text-sm font-light transition-all duration-200 hover:border-gold hover:text-gold"
            >
              Back to home
            </Link>
          </div>

          {error.digest && (
            <p className="mt-8 text-[0.7rem] text-text-muted">
              Error ID: <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

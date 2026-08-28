"use client";

import Image from "next/image";
import Starfield from "@/components/Starfield";
import { scrollBehavior } from "@/lib/motion";

// ════════════════════════════════════════════════════════════════════
// Foundry · Hero
//
// Two ideas, both taken from the logo rather than added to it.
//
//   1. The mark sits in a real sky. <Starfield> draws the field live behind
//      a transparent cut-out of the artwork, so the roundel is *in* the
//      starfield instead of on a photograph of one. The old hero pasted the
//      full 1.5 MB PNG — black rectangle and all — over a decorative gold
//      radial-gradient glow. The glow is gone; the sky replaces it, and it
//      belongs to the brand rather than to the era of ambient blur.
//
//   2. The headline is set the way the wordmark is set. "IMPERIAL" is heavy
//      and tight over "ENTREPRENEURS" light and wide, optically justified to
//      one measure. The h1 does the same across its three lines. The words
//      are untouched — only the treatment carries the emphasis that a gold
//      serif italic used to.
// ════════════════════════════════════════════════════════════════════

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden px-8 pt-28 pb-20"
    >
      <Starfield className="pointer-events-none absolute inset-0 h-full w-full" />

      <div className="relative mx-auto w-full max-w-[1200px]">
        {/* The artwork, cut out of its field. */}
        <div className="anim-fade-in mb-20 flex justify-center lg:mb-24">
          <Image
            src="/logo-full.png"
            alt="Imperial Entrepreneurs — go do shit."
            width={1024}
            height={379}
            priority
            sizes="(min-width: 1024px) 620px, 84vw"
            className="h-auto w-full max-w-[620px]"
          />
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-8 border-t border-border pt-8 md:grid-cols-[10rem_1fr]">
          {/* The organisation's name as real text, not only as image alt.
              It sits in the field-name column rather than as an eyebrow over
              the heading — same words, a role instead of a decoration. */}
          <p className="label-wide anim-fade-up hidden text-text-secondary md:block">
            Imperial
            <br className="hidden md:block" /> Entrepreneurs
          </p>

          <div className="min-w-0">
            <h1 className="anim-fade-up delay-100 mb-8 text-[clamp(1.9rem,5.4vw,4.5rem)] leading-[1.05]">
              <span className="block font-semibold tracking-[-0.035em] text-text-primary">
                The founder community,
              </span>
              <span className="block font-normal tracking-[-0.012em] text-text-primary">
                built by Imperial students
              </span>
              <span className="block font-light tracking-[0.005em] text-text-secondary">
                for Imperial students.
              </span>
            </h1>

            <p className="anim-fade-up delay-200 mb-10 max-w-[54ch] text-[1.0625rem] leading-[1.65] text-text-secondary">
              Foundry connects students, recent graduates, alumni founders, mentors,
              and investors across Imperial&apos;s ecosystem. Build something real, together.
            </p>

            <div className="anim-fade-up delay-300 flex flex-wrap items-center gap-3">
              <a
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-3.5 text-sm font-semibold text-bg-primary no-underline transition-colors duration-150 hover:bg-accent-dim"
              >
                Join Foundry
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2.5 7H11.5M8 3.5L11.5 7L8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <a
                href="#who-we-are"
                onClick={(e) => { e.preventDefault(); document.getElementById("who-we-are")?.scrollIntoView({ behavior: scrollBehavior() }); }}
                className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-white/[0.05] px-7 py-3.5 text-sm text-text-primary no-underline transition-colors duration-150 hover:border-accent hover:bg-white/[0.10]"
              >
                Learn more
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

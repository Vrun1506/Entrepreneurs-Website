"use client";

import Image from "next/image";
import { scrollBehavior } from "@/lib/motion";

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col justify-center px-8 pt-32 pb-24 max-w-[1200px] mx-auto overflow-x-hidden"
    >
      {/* Ambient glow — decorative only */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/4 -right-[10%] w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.06) 0%, transparent 70%)" }}
      />

      {/* Top: text + logo (two columns on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-start">
        {/* Left: copy */}
        <div>
          {/* Brand eyebrow — surfaces the exact "Imperial Entrepreneurs" name at
              the top of the homepage for branded search + human recognition. */}
          <p className="anim-fade-up font-medium text-gold text-sm tracking-[0.2em] uppercase mb-4">
            Imperial Entrepreneurs
          </p>

          {/* Headline */}
          <h1 className="anim-fade-up delay-100 font-display text-text-primary mb-7 leading-[1.05] tracking-tight text-[clamp(2.5rem,5vw,4.75rem)]">
            The founder community,
            <br />
            built by Imperial students
            <br />
            <em className="text-gold">for Imperial students.</em>
          </h1>

          {/* Subheading */}
          <p className="anim-fade-up delay-200 text-text-secondary font-light leading-[1.7] max-w-[520px] mb-12 text-[1.05rem]">
            Foundry connects students, recent graduates, alumni founders, mentors,
            and investors across Imperial&apos;s ecosystem. Build something real, together.
          </p>

          {/* CTAs */}
          <div className="anim-fade-up delay-300 flex flex-wrap items-center gap-4">
            <a
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full no-underline bg-gold text-bg-primary text-sm font-medium tracking-wide transition-all duration-200 hover:bg-gold-light hover:-translate-y-px"
            >
              Join Foundry
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7H11.5M8 3.5L11.5 7L8 10.5" stroke="#0c0c0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href="#who-we-are"
              onClick={(e) => { e.preventDefault(); document.getElementById("who-we-are")?.scrollIntoView({ behavior: scrollBehavior() }); }}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full no-underline bg-transparent text-text-secondary border border-border text-sm font-light transition-all duration-200 hover:border-gold hover:text-gold"
            >
              Learn more
            </a>
          </div>
        </div>

        {/* Right: logo */}
        <div className="anim-fade-in delay-400 relative flex justify-center lg:justify-end">
          <Image
            src="/entrepreneurs-logo.png"
            alt="Imperial Entrepreneurs"
            width={2416}
            height={1270}
            priority
            sizes="(min-width: 1024px) 480px, 80vw"
            className="w-full max-w-[480px] h-auto"
            style={{ mixBlendMode: "screen" }}
          />
        </div>
      </div>
    </section>
  );
}
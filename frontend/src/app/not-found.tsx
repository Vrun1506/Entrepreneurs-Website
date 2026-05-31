import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col overflow-hidden">
      {/* Ambient glow — decorative */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[15%] -right-[10%] w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[20%] -left-[10%] w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.03) 0%, transparent 70%)" }}
      />

      {/* Top bar */}
      <header className="relative z-10 px-8 py-5">
        <div className="max-w-[1200px] mx-auto">
          <Link href="/" className="no-underline w-fit inline-block">
            <BrandLogo size="sm" />
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[560px] text-center flex flex-col items-center">
          <Image
            src="/entrepreneurs-logo.png"
            alt="Imperial Entrepreneurs"
            width={4832}
            height={2540}
            priority
            sizes="(min-width: 768px) 320px, 70vw"
            className="w-full max-w-[320px] h-auto mb-8"
            style={{ mixBlendMode: "screen" }}
          />

          <div className="font-display text-gold text-[clamp(4rem,12vw,8rem)] leading-none mb-4">
            404
          </div>

          <h1 className="font-display text-text-primary leading-[1.15] tracking-tight mb-5 text-[clamp(1.75rem,3.5vw,2.5rem)]">
            This page doesn&apos;t exist.
          </h1>

          <p className="text-[0.95rem] text-text-secondary font-light leading-[1.7] mb-10">
            The link may be broken, the page may have been moved, or you may have
            mistyped the address. Let&apos;s get you back on track.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full no-underline bg-gold text-bg-primary text-sm font-medium tracking-wide transition-all duration-200 hover:bg-gold-light hover:-translate-y-px"
            >
              Back to home
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M2.5 7H11.5M8 3.5L11.5 7L8 10.5" stroke="#0c0c0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full no-underline bg-transparent text-text-secondary border border-border text-sm font-light transition-all duration-200 hover:border-gold hover:text-gold"
            >
              Join Foundry
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-5">
        <div className="max-w-[1200px] mx-auto flex justify-center">
          <p className="text-[0.75rem] text-text-muted">
            Foundry · Imperial Entrepreneurs
          </p>
        </div>
      </footer>
    </div>
  );
}

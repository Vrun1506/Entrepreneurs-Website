"use client";

const FOOTER_LINKS = ["Privacy", "Terms", "Contact", "Submit opportunity"];

function FooterLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-md bg-gold flex items-center justify-center shrink-0">
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="#0c0c0b" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="font-display text-[0.95rem] text-text-primary">Foundry</span>
      <span className="text-[0.75rem] text-text-muted ml-1">Imperial College London</span>
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-bg-secondary py-12 px-8">
      <div className="max-w-[1200px] mx-auto flex flex-wrap justify-between items-center gap-6">
        <FooterLogo />

        <nav className="flex flex-wrap gap-8">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link}
              href="#"
              className="text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary"
            >
              {link}
            </a>
          ))}
        </nav>

        <p className="text-[0.75rem] text-text-muted">
          © 2025 Foundry · Built by students, for founders
        </p>
      </div>
    </footer>
  );
}
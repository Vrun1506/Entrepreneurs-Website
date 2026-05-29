const LINKEDIN_URL  = "https://www.linkedin.com/company/imperial-entrepreneurs/";
const INSTAGRAM_URL = "https://www.instagram.com/imperialentrepreneurs/";
const EMAIL_ADDRESS = "imperial.founders@gmail.com";

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

        <nav className="flex flex-wrap items-center gap-2">
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Imperial Entrepreneurs on LinkedIn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0A66C2]/15 border border-[#0A66C2]/35 text-[#7CB6F0] text-[0.75rem] font-medium no-underline transition-colors duration-150 hover:bg-[#0A66C2]/30 hover:text-white"
          >
            <LinkedInIcon />
            LinkedIn
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Imperial Entrepreneurs on Instagram"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E1306C]/15 border border-[#E1306C]/35 text-[#F08AB0] text-[0.75rem] font-medium no-underline transition-colors duration-150 hover:bg-[#E1306C]/30 hover:text-white"
          >
            <InstagramIcon />
            Instagram
          </a>
          <a
            href={`mailto:${EMAIL_ADDRESS}`}
            aria-label={`Email ${EMAIL_ADDRESS}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-muted border border-gold/35 text-gold-light text-[0.75rem] font-medium no-underline transition-colors duration-150 hover:bg-gold/25 hover:text-white"
          >
            <EmailIcon />
            Email
          </a>
        </nav>

        <p className="text-[0.75rem] text-text-muted">
          © 2025 Foundry · Built by students, for founders
        </p>
      </div>
    </footer>
  );
}

function LinkedInIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 11-.001-4.12 2.06 2.06 0 01.001 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

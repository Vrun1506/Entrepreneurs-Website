"use client";

import { useState, useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { scrollBehavior } from "@/lib/motion";

const NAV_LINKS = [
  { label: "Who are we?", href: "#who-we-are" },
  { label: "Community",   href: "#community" },
  { label: "Opportunities", href: "#opportunities" },
  { label: "Events",      href: "#events" },
  { label: "Apply",       href: "#apply" },
];

function Logo() {
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: scrollBehavior() }); }}
      className="no-underline inline-block"
      aria-label="Foundry — Imperial Entrepreneurs"
    >
      <BrandLogo size="md" priority />
    </a>
  );
}

function NavLink({ label, href, isActive, onClick }: {
  label: string;
  href: string;
  isActive: boolean;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <a
      href={href}
      onClick={(e) => onClick(e, href)}
      className={isActive ? "relative text-sm tracking-wide transition-colors duration-150 no-underline text-text-primary font-medium" : "relative text-sm tracking-wide transition-colors duration-150 no-underline text-text-secondary hover:text-text-primary"}
    >
      {label}
      {isActive && (
        <span className="absolute -bottom-1 left-0 right-0 h-px bg-gold rounded-sm" />
      )}
    </a>
  );
}

function JoinButton() {
  return (
    <a
      href="/login"
      className="hidden md:inline-flex items-center px-5 py-2 rounded-full no-underline bg-gold text-bg-primary text-sm font-medium tracking-wide transition-all duration-200 hover:bg-gold-light hover:-translate-y-px"
    >
      Join Foundry
    </a>
  );
}

function HamburgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Toggle menu"
      className="md:hidden flex flex-col gap-1 border border-border rounded-lg p-1.5 bg-transparent cursor-pointer"
    >
      <span className={`block w-[18px] h-px bg-text-secondary rounded transition-all duration-200 ${open ? "rotate-45 translate-x-0.5 translate-y-[5px]" : ""}`} />
      <span className={`block w-[18px] h-px bg-text-secondary rounded transition-all duration-200 ${open ? "opacity-0" : ""}`} />
      <span className={`block w-[18px] h-px bg-text-secondary rounded transition-all duration-200 ${open ? "-rotate-45 translate-x-0.5 -translate-y-[5px]" : ""}`} />
    </button>
  );
}

export default function Navbar() {
  const [scrolled,      setScrolled]      = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      const ids = NAV_LINKS.map((l) => l.href.replace("#", ""));
      for (const id of [...ids].reverse()) {
        const el = document.getElementById(id);
        if (el && window.scrollY >= el.offsetTop - 120) {
          setActiveSection(id);
          break;
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    document.getElementById(href.replace("#", ""))?.scrollIntoView({ behavior: scrollBehavior() });
    setMenuOpen(false);
  };

  return (
    <header
      className={scrolled ? "fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-bg-primary/90 backdrop-blur-md border-b border-border/60" : "fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-transparent border-b border-transparent"}
    >
      <nav className="max-w-[1200px] mx-auto px-8 h-16 flex items-center justify-between">
        <Logo />

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.href}
              {...link}
              isActive={activeSection === link.href.replace("#", "")}
              onClick={handleNavClick}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <JoinButton />
          <HamburgerButton open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-bg-primary/95 backdrop-blur-md border-t border-border-subtle px-8 py-6 flex flex-col gap-5">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="text-base text-text-secondary no-underline hover:text-text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-full no-underline bg-gold text-bg-primary text-base font-medium tracking-wide"
          >
            Join Foundry
          </a>
        </div>
      )}
    </header>
  );
}
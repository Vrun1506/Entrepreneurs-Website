"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SignOutButton from "@/app/admin/SignOutButton";
import { BrandLogo } from "@/components/BrandLogo";

type Tab = "community" | "opportunities" | "events" | "vcs" | "calendar" | "activity" | "submissions" | "settings";

export default function AppNav({
  active,
  isApproved,
  isAdmin = false,
}: {
  active: Tab;
  isApproved: boolean;
  isAdmin?: boolean;
}) {
  // Admins always get the full nav so they can navigate the user-facing UI
  // for diagnostic purposes, regardless of their own profile status.
  const showFullNav = isApproved || isAdmin;
  const homeHref = showFullNav ? "/community" : "/settings";
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile sheet on Escape and lock body scroll while open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const navItems = showFullNav
    ? [
        { href: "/community",     label: "Community",     tab: "community"     as const },
        { href: "/opportunities", label: "Opportunities", tab: "opportunities" as const },
        { href: "/events",        label: "Events",        tab: "events"        as const },
        { href: "/vcs",           label: "Grants & VCs",  tab: "vcs"           as const },
        { href: "/calendar",      label: "Calendar",      tab: "calendar"      as const },
        { href: "/my-activity",   label: "My activity",   tab: "activity"      as const },
        { href: "/my-submissions", label: "My submissions", tab: "submissions" as const },
      ]
    : [
        { href: "/pending",       label: "Return to home", tab: null },
      ];

  return (
    <header className="sticky top-0 z-40 px-4 sm:px-8 py-4 sm:py-5 bg-bg-primary/92 backdrop-blur-md border-b border-border">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-3">
        <Link href={homeHref} className="no-underline shrink-0" onClick={() => setMobileOpen(false)}>
          <BrandLogo size="sm" priority />
        </Link>

        {/* Desktop nav (≥lg — tablets use the hamburger sheet, which has
            room for all items without crowding) */}
        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((it) => (
            <NavLink key={it.href} href={it.href} label={it.label} active={it.tab !== null && active === it.tab} />
          ))}
          <NavLink href="/settings" label="Settings" active={active === "settings"} />
          {isAdmin && (
            <Link
              href="/admin"
              className="ml-3 rounded-lg border border-border-strong bg-white/[0.05] px-3.5 py-1.5 text-[0.78rem] text-text-primary no-underline transition-colors duration-150 hover:border-accent hover:bg-white/[0.10]"
            >
              ← Admin
            </Link>
          )}
        </nav>

        {/* Mobile / tablet cluster: sign-out icon + hamburger */}
        <div className="lg:hidden flex items-center gap-2">
          <SignOutButton />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="w-11 h-11 rounded-lg bg-white/[0.05] border border-border-strong text-text-primary cursor-pointer flex items-center justify-center transition-colors hover:bg-white/[0.10] hover:border-accent"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {/* Desktop sign-out */}
        <div className="hidden lg:block">
          <SignOutButton />
        </div>
      </div>

      {/* Mobile / tablet sheet */}
      {mobileOpen && (
        <div className="lg:hidden mt-4 -mx-4 sm:-mx-8 border-t border-border bg-bg-primary">
          <nav className="flex flex-col py-2">
            {navItems.map((it) => (
              <MobileLink
                key={it.href}
                href={it.href}
                label={it.label}
                active={it.tab !== null && active === it.tab}
                onClick={() => setMobileOpen(false)}
              />
            ))}
            <MobileLink
              href="/settings"
              label="Settings"
              active={active === "settings"}
              onClick={() => setMobileOpen(false)}
            />
            {isAdmin && (
              <MobileLink
                href="/admin"
                label="← Admin"
                active={false}
                onClick={() => setMobileOpen(false)}
                accent
              />
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative px-3 py-1.5 text-[0.78rem] no-underline transition-colors duration-150 ${
        active ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
      {/* Sits on the header's bottom rule, so the active tab reads as
          connected to the page below it rather than as a floating capsule. */}
      {active && <span aria-hidden className="underline-draw absolute -bottom-[13px] left-3 right-3 h-px bg-accent" />}
    </Link>
  );
}

function MobileLink({
  href, label, active, onClick, accent = false,
}: {
  href: string; label: string; active: boolean; onClick: () => void; accent?: boolean;
}) {
  const base = "flex items-center border-b border-border-subtle px-6 py-3 text-[0.9rem] no-underline transition-colors min-h-[44px] last:border-b-0";
  const tone = accent
    ? "text-text-primary hover:bg-white/[0.06]"
    : active
      ? "text-text-primary bg-white/[0.04]"
      : "text-text-secondary hover:bg-white/[0.02] hover:text-text-primary";
  return (
    <Link href={href} onClick={onClick} className={`${base} ${tone}`}>
      {label}
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6"  x2="6" y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  );
}

import Link from "next/link";
import SignOutButton from "@/app/admin/SignOutButton";

type Tab = "community" | "settings";

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
  return (
    <header className="px-8 py-5 border-b border-border-subtle">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between">
        <Link href={homeHref} className="flex items-center gap-2 no-underline">
          <span className="w-7 h-7 rounded-md bg-gold flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="#0c0c0b" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-[1.1rem] text-text-primary tracking-tight">Foundry</span>
        </Link>

        <nav className="flex items-center gap-1">
          {showFullNav ? (
            <NavLink href="/community" label="Community" active={active === "community"} />
          ) : (
            <NavLink href="/pending" label="Return to home" active={false} />
          )}
          <NavLink href="/settings" label="Settings" active={active === "settings"} />
          {isAdmin && (
            <Link
              href="/admin"
              className="ml-2 px-4 py-1.5 rounded-full text-[0.8rem] text-gold no-underline transition-colors duration-150 border border-gold/30 hover:border-gold/60 hover:text-gold-light"
            >
              ← Admin
            </Link>
          )}
        </nav>

        <SignOutButton />
      </div>
    </header>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-4 py-1.5 rounded-full text-[0.8rem] no-underline transition-colors duration-150 ${
        active
          ? "text-text-primary bg-white/[0.04]"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {label}
    </Link>
  );
}

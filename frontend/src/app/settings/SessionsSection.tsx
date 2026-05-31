"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/dates";

// ════════════════════════════════════════════════════════════════════
// Foundry · Active sessions card
//
// Calls supabase.auth.signOut({ scope: 'global' }) to revoke every
// active refresh token attached to the user, on every device. After
// success we route to /login so the now-stale local cookie isn't sat
// on a protected page.
//
// We deliberately don't render a per-session list yet: it requires a
// SECURITY DEFINER RPC over auth.sessions and a per-row revoke RPC.
// The "sign out everywhere" affordance handles the security-critical
// case (compromised device) without that depth.
// ════════════════════════════════════════════════════════════════════

export default function SessionsSection({
  signedInAs,
  lastSignInAt,
}: {
  signedInAs:   string;
  lastSignInAt: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [confirming, setConfirming] = useState(false);
  const [pending,    setPending]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const lastSeen = lastSignInAt ? formatDateTime(lastSignInAt) : null;

  const handleSignOutEverywhere = async () => {
    setError(null);
    setPending(true);
    const { error: e } = await supabase.auth.signOut({ scope: "global" });
    setPending(false);
    if (e) { setError(e.message); return; }
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="rounded-2xl bg-bg-card border border-border-subtle p-8 space-y-5">
      <div>
        <div className="text-[0.95rem] font-medium text-text-primary mb-1">Active sessions</div>
        <p className="text-[0.8rem] text-text-muted leading-relaxed">
          You&apos;re currently signed in as <span className="text-text-secondary">{signedInAs}</span>{lastSeen ? ` (most recent sign-in: ${lastSeen})` : ""}. If you suspect another device still has a session — laptop you don&apos;t have anymore, browser on a shared computer, anything you didn&apos;t initiate — sign out everywhere. That revokes every refresh token tied to your account.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
          {error}
        </div>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="px-5 py-2.5 rounded-lg bg-transparent border border-[#ff4d4d]/25 text-[#ff6b6b] text-[0.825rem] font-medium cursor-pointer transition-colors hover:bg-[#ff4d4d]/10"
        >
          Sign out everywhere
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-[0.8rem] text-[#ff8b8b] leading-relaxed">
            This will sign you out on this device too. You&apos;ll have to sign in again to get back to Foundry.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSignOutEverywhere}
              disabled={pending}
              className="px-5 py-2.5 rounded-lg bg-[#ff4d4d]/15 border border-[#ff4d4d]/30 text-[#ff6b6b] text-[0.825rem] font-medium cursor-pointer transition-colors hover:bg-[#ff4d4d]/25 disabled:opacity-60"
            >
              {pending ? "Signing out…" : "Confirm — sign out everywhere"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="px-5 py-2.5 rounded-lg bg-transparent border border-border text-text-muted text-[0.825rem] cursor-pointer transition-colors hover:text-text-primary disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

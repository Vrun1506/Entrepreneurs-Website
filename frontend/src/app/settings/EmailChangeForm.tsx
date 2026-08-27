"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { isImperialEmail } from "@/lib/auth/imperialEmail";

// ════════════════════════════════════════════════════════════════════
// Change your email address.
//
// HOW GOTRUE ACTUALLY BEHAVES HERE, measured against the local stack
// rather than assumed, because the documented behaviour and the observed
// behaviour differ for this flow.
//
// With double_confirm_changes on, updateUser({ email }) writes the
// pending address to email_change and sends a 6-digit code to BOTH
// mailboxes. Only the code sent to the CURRENT address is usable:
// verifying it applies the change immediately and clears both tokens.
// The code sent to the new address is rejected — with either address in
// the request — so there is no second step to ask for. A form that asked
// for both codes could never be completed.
//
// WHY THAT IS STILL SAFE, and why there is no password step. The code
// that authorises the change goes to the mailbox the account already
// has. Someone on a stolen session can start a change to an address they
// control, but the code they receive there does nothing; they need the
// existing inbox. That is the reauthentication. A password would be a
// second lock on the same door, and it would have to be skipped for
// Google-only accounts — which have no password identity — i.e. skipped
// exactly where it was meant to help.
//
// WHAT THE FLOW DOES NOT PROVE is that the member can read the NEW
// mailbox, because the code sent there cannot be verified. A typo would
// therefore move the account to an address nobody can receive mail at.
// Hence the confirm field: it catches the mistake this flow cannot.
//
// The domain check runs before updateUser rather than relying on the DB
// trigger, because the trigger fires on the final write. See
// lib/auth/imperialEmail.ts.
// ════════════════════════════════════════════════════════════════════

type Stage = "idle" | "codes" | "done";

export default function EmailChangeForm({
  currentEmail,
  role,
}: {
  currentEmail: string;
  role: "student" | "alum";
}) {
  const supabase = createClient();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("idle");
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";
  const codeCls = `${inputCls} font-mono tracking-[0.3em] text-center`;

  const pending = newEmail.trim().toLowerCase();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!pending || !pending.includes("@") || pending.startsWith("@") || pending.endsWith("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (pending !== confirmEmail.trim().toLowerCase()) {
      setError("The two addresses don't match.");
      return;
    }
    if (pending === currentEmail.trim().toLowerCase()) {
      setError("That's already your email address.");
      return;
    }
    if (role === "student" && !isImperialEmail(pending)) {
      setError("Student accounts must keep an @imperial.ac.uk or @ic.ac.uk address.");
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ email: pending });
    setIsLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStage("codes");
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // The current address, not the new one: GoTrue looks the account up by
    // the email in the request, and until the change lands no account has
    // the new address.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: currentEmail.trim().toLowerCase(),
      token: code.trim(),
      type: "email_change",
    });
    setIsLoading(false);
    if (verifyError) {
      setError(friendlyCodeError(verifyError.message));
      return;
    }

    setStage("done");
    setCode("");
    // The header renders the signed-in address, so it is now stale.
    router.refresh();
  };

  if (stage === "done") {
    return (
      <div className="space-y-3 rounded-2xl bg-bg-card border border-border-subtle p-8">
        <div className="text-[0.95rem] font-medium text-text-primary">Email address</div>
        <div className="px-4 py-3 rounded-lg bg-gold-muted border border-gold/30 text-[0.8rem] text-gold-light leading-relaxed">
          Your email address is now <span className="font-medium">{pending}</span>. Use it next time you sign in.
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={stage === "idle" ? handleRequest : handleConfirm}
      className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8"
    >
      <div>
        <div className="text-[0.95rem] font-medium text-text-primary mb-1">Change email address</div>
        <p className="text-[0.8rem] text-text-muted leading-relaxed">
          {stage === "idle" ? (
            <>
              We&apos;ll send a code to <span className="text-text-secondary">{currentEmail}</span> to
              confirm it&apos;s you. Check the new address carefully — it&apos;s where you&apos;ll sign in
              afterwards.
              {role === "student" && " Student accounts must stay on an Imperial address."}
            </>
          ) : (
            <>
              Enter the code we sent to <span className="text-text-secondary">{currentEmail}</span>. It
              expires in an hour.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
          {error}
        </div>
      )}

      {stage === "idle" ? (
        <div>
          <label htmlFor="new-email" className="block text-[0.75rem] text-text-muted mb-1.5">
            New email address
          </label>
          <input
            id="new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(ev) => setNewEmail(ev.target.value)}
            className={inputCls}
            placeholder={role === "student" ? "you@imperial.ac.uk" : "you@example.com"}
            required
          />

          <label htmlFor="confirm-email" className="block text-[0.75rem] text-text-muted mb-1.5 mt-4">
            Confirm new email address
          </label>
          <input
            id="confirm-email"
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={(ev) => setConfirmEmail(ev.target.value)}
            className={inputCls}
            placeholder="Type it again"
            required
          />
        </div>
      ) : (
        <div>
          <label htmlFor="email-change-code" className="block text-[0.75rem] text-text-muted mb-1.5">
            Code sent to {currentEmail}
          </label>
          <input
            id="email-change-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            className={codeCls}
            placeholder="000000"
            required
          />
          <p className="mt-2 text-[0.75rem] text-text-muted leading-relaxed">
            Changing to <span className="text-text-secondary">{pending}</span>.
          </p>
        </div>
      )}

      <Button type="submit" loading={isLoading} variant="primary" size="md">
        {stage === "idle" ? "Send code" : "Confirm change"}
      </Button>
    </form>
  );
}

/**
 * Friendly copy for a failed code.
 *
 * GoTrue answers a wrong code and a stale one with the same string —
 * "Token has expired or is invalid" — so splitting them into separate
 * messages means guessing, and guessing "expired" tells someone who just
 * mistyped to start over when they only needed to retype. One message
 * that covers both is the honest version.
 */
function friendlyCodeError(raw: string): string {
  const e = raw.toLowerCase();
  if (e.includes("rate") || e.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (e.includes("expired") || e.includes("invalid") || e.includes("token")) {
    return "That code is incorrect or has expired. Check it, or start again to get a new one.";
  }
  return "We couldn't verify that code. Please try again.";
}

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export default function PasswordChangeForm({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const supabase = createClient();

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  // OAuth-only (Google) accounts have no password to manage — hide the card entirely.
  if (!hasPassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);

    // Reauthenticate first: verify the current password so an unlocked, logged-in
    // session can't silently change the credential. On success this refreshes the
    // same user's session; on failure the existing session is untouched and we abort.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      setError("Current password is incorrect.");
      setIsLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    // After a password change, revoke every OTHER active session so a
    // previously-stolen refresh token can't outlive the credential it
    // was issued against. The current session stays alive — the user
    // doesn't need to re-sign-in on this device.
    await supabase.auth.signOut({ scope: "others" });

    setSaved(true);
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
      <div>
        <div className="text-[0.95rem] font-medium text-text-primary mb-1">Change password</div>
        <p className="text-[0.8rem] text-text-muted leading-relaxed">
          You&apos;ll stay signed in on this device. Every other device you&apos;re signed in on will be signed out automatically.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="px-4 py-3 rounded-lg bg-gold-muted border border-gold/30 text-[0.8rem] text-gold-light leading-relaxed">
          Password updated.
        </div>
      )}

      <div>
        <label htmlFor="current-password" className="block text-[0.75rem] text-text-muted mb-1.5">Current password</label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputCls}
          required
        />
      </div>

      <div>
        <label htmlFor="new-password" className="block text-[0.75rem] text-text-muted mb-1.5">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          minLength={8}
          required
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="block text-[0.75rem] text-text-muted mb-1.5">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
          minLength={8}
          required
        />
      </div>

      <Button
        type="submit"
        loading={isLoading}
        variant="primary"
        size="md"
      >
        Update password
      </Button>
    </form>
  );
}

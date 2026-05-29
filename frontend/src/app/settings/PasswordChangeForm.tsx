"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function PasswordChangeForm({ hasPassword }: { hasPassword: boolean }) {
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  if (!hasPassword) {
    return (
      <div className="rounded-2xl bg-bg-card border border-border-subtle p-8">
        <div className="text-[0.95rem] font-medium text-text-primary mb-2">Password</div>
        <p className="text-[0.8rem] text-text-muted leading-relaxed">
          You signed in with Google, so there&apos;s no password on this account. Manage your sign-in
          credentials through your Google account.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setIsLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    setSaved(true);
    setPassword("");
    setConfirm("");
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
      <div>
        <div className="text-[0.95rem] font-medium text-text-primary mb-1">Change password</div>
        <p className="text-[0.8rem] text-text-muted leading-relaxed">
          You&apos;ll stay signed in on this device after updating.
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

      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center px-6 py-3 rounded-xl bg-gold text-bg-primary text-[0.85rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : (
          "Update password"
        )}
      </button>
    </form>
  );
}

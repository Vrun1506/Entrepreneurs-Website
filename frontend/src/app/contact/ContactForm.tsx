"use client";

import { useState, useTransition } from "react";
import { submitContactTicket } from "./actions";
import { TurnstileWidget, turnstileConfigured } from "@/components/forms/TurnstileWidget";

export default function ContactForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSent(false);
    if (turnstileConfigured && !turnstileToken) {
      setError("Please complete the verification challenge below.");
      return;
    }
    startTransition(async () => {
      const res = await submitContactTicket({ subject, message, turnstileToken });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent(true);
      setSubject("");
      setMessage("");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
          {error}
        </div>
      )}
      {sent && !error && (
        <div className="px-4 py-3 rounded-lg bg-gold-muted border border-gold/30 text-[0.8rem] text-gold-light leading-relaxed">
          Thanks — we&apos;ve received your message and will be in touch.
        </div>
      )}

      <div>
        <label htmlFor="subject" className="block text-[0.75rem] text-text-muted mb-1.5">Subject</label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputCls}
          maxLength={150}
          required
        />
      </div>

      <div>
        <label htmlFor="message" className="block text-[0.75rem] text-text-muted mb-1.5">
          Message <span className="text-text-muted/70 ml-2">{message.length}/4000</span>
        </label>
        <textarea
          id="message"
          rows={8}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputCls} resize-none`}
          maxLength={4000}
          required
        />
      </div>

      {turnstileConfigured && <TurnstileWidget onToken={setTurnstileToken} />}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center px-6 py-3 rounded-xl bg-gold text-bg-primary text-[0.85rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {pending ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : (
          "Send message"
        )}
      </button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "user" | "admin";

type Props = {
  signupEmail: string;
  defaultOrganiser: string;
  mode: Mode;
};

export default function EventForm({ signupEmail, defaultOrganiser, mode }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lumaLink, setLumaLink] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [location, setLocation] = useState("");
  const [organiserName, setOrganiserName] = useState(defaultOrganiser);
  const [useCustomContact, setUseCustomContact] = useState(false);
  const [customContactEmail, setCustomContactEmail] = useState("");
  const [contactEmailVisible, setContactEmailVisible] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (title.trim().length < 2) {
      setError("Title is required."); return;
    }
    if (description.trim().length < 20) {
      setError("Description must be at least 20 characters."); return;
    }
    if (!/^https?:\/\//i.test(lumaLink.trim())) {
      setError("Luma link must be a valid URL."); return;
    }
    if (!eventAt) {
      setError("Date and time are required."); return;
    }
    if (new Date(eventAt) < new Date()) {
      setError("Event must start in the future."); return;
    }
    if (!location.trim()) {
      setError("Location is required."); return;
    }
    if (!organiserName.trim()) {
      setError("Organiser name is required."); return;
    }

    const contactEmail = useCustomContact ? customContactEmail.trim() : signupEmail;
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(contactEmail)) {
      setError("Contact email is invalid."); return;
    }

    setIsLoading(true);
    const rpc = mode === "admin" ? "admin_create_event" : "submit_event";
    const { error: rpcError } = await supabase.rpc(rpc, {
      p_title:                 title.trim(),
      p_description:           description.trim(),
      p_luma_link:             lumaLink.trim(),
      p_event_at:              new Date(eventAt).toISOString(),
      p_location:              location.trim(),
      p_organiser_name:        organiserName.trim(),
      p_contact_email:         contactEmail,
      p_contact_email_visible: contactEmailVisible,
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }

    router.replace(mode === "admin" ? "/admin/events" : "/events?submitted=1");
    router.refresh();
  };

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
          {error}
        </div>
      )}

      <Field label="Title" required>
        <input type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} required />
      </Field>

      <Field label="Description" required hint={`${description.length}/5000`}>
        <textarea rows={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} required />
      </Field>

      <Field label="Luma link" required>
        <input type="url" placeholder="https://lu.ma/your-event" value={lumaLink} onChange={(e) => setLumaLink(e.target.value)} className={inputCls} required />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Date & time" required>
          <input type="datetime-local" value={eventAt} onChange={(e) => setEventAt(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Location" required hint="e.g. Imperial Business School, or 'Online'">
          <input type="text" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} required />
        </Field>
      </div>

      <Field label="Organiser name" required>
        <input type="text" maxLength={200} value={organiserName} onChange={(e) => setOrganiserName(e.target.value)} className={inputCls} required />
      </Field>

      <div className="pt-2 border-t border-border-subtle">
        <div className="text-[0.85rem] text-text-primary mb-3 mt-3">Contact email</div>
        <p className="text-[0.75rem] text-text-muted leading-relaxed mb-3">
          Admins always see your signup email. Tick below to use a different inbox as the public contact.
        </p>
        <label className="flex items-center gap-2 text-[0.8rem] text-text-secondary mb-3 cursor-pointer">
          <input type="checkbox" checked={useCustomContact} onChange={(e) => setUseCustomContact(e.target.checked)} />
          Use a different contact email
        </label>
        {useCustomContact ? (
          <input type="email" placeholder="contact@example.com" value={customContactEmail} onChange={(e) => setCustomContactEmail(e.target.value)} className={inputCls} required />
        ) : (
          <div className="px-4 py-3 bg-white/[0.02] border border-border-subtle rounded-lg text-[0.8rem] text-text-muted">
            {signupEmail}
          </div>
        )}
        <label className="flex items-start gap-2 text-[0.8rem] text-text-secondary mt-3 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={contactEmailVisible} onChange={(e) => setContactEmailVisible(e.target.checked)} />
          <span>
            Make this contact email visible to community members.
            <span className="text-text-muted block text-[0.75rem] mt-0.5">If unchecked, attendees use the Luma link to RSVP.</span>
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-3 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : mode === "admin" ? (
          "Publish event"
        ) : (
          "Submit for review"
        )}
      </button>
    </form>
  );
}

function Field({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[0.75rem] text-text-muted mb-1.5">
        {label} {required && <span className="text-[#ff6b6b]">*</span>}
        {hint && <span className="text-text-muted/70 ml-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/forms/Field";
import { ErrorBanner } from "@/components/forms/Banners";
import { inputCls } from "@/components/forms/styles";
import { TurnstileWidget, turnstileConfigured } from "@/components/forms/TurnstileWidget";
import { submitEvent, updateOwnEvent } from "@/app/events/actions";

type Mode = "user" | "admin";

export type EventInitialValues = {
  title: string;
  description: string;
  lumaLink: string;
  eventAt: string;
  location: string;
  organiserName: string;
  contactEmail: string;
  contactEmailVisible: boolean;
};

type Props = {
  signupEmail: string;
  defaultOrganiser: string;
  mode: Mode;
  editingId?: string;
  initialValues?: EventInitialValues;
};

export default function EventForm({ signupEmail, defaultOrganiser, mode, editingId, initialValues }: Props) {
  const router = useRouter();

  const iv = initialValues;
  const initialContactIsCustom = !!iv && iv.contactEmail.toLowerCase() !== signupEmail.toLowerCase();

  const [title, setTitle] = useState(iv?.title ?? "");
  const [description, setDescription] = useState(iv?.description ?? "");
  const [lumaLink, setLumaLink] = useState(iv?.lumaLink ?? "");
  const [eventAt, setEventAt] = useState(iv?.eventAt ?? "");
  const [location, setLocation] = useState(iv?.location ?? "");
  const [organiserName, setOrganiserName] = useState(iv?.organiserName ?? defaultOrganiser);
  const [useCustomContact, setUseCustomContact] = useState(initialContactIsCustom);
  const [customContactEmail, setCustomContactEmail] = useState(initialContactIsCustom ? iv!.contactEmail : "");
  const [contactEmailVisible, setContactEmailVisible] = useState(iv?.contactEmailVisible ?? false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const showTurnstile = mode === "user" && !editingId && turnstileConfigured;

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
    if (showTurnstile && !turnstileToken) {
      setError("Please complete the verification challenge below."); return;
    }

    setIsLoading(true);

    if (editingId) {
      const res = await updateOwnEvent(editingId, {
        title:                 title.trim(),
        description:           description.trim(),
        lumaLink:              lumaLink.trim(),
        eventAtIso:            new Date(eventAt).toISOString(),
        location:              location.trim(),
        organiserName:         organiserName.trim(),
        contactEmail,
        contactEmailVisible,
      });
      if (!res.ok) {
        setError(res.error);
        setIsLoading(false);
        return;
      }
      router.replace("/my-submissions");
      router.refresh();
      return;
    }

    const res = await submitEvent({
      mode,
      turnstileToken,
      payload: {
        title:                 title.trim(),
        description:           description.trim(),
        lumaLink:              lumaLink.trim(),
        eventAtIso:            new Date(eventAt).toISOString(),
        location:              location.trim(),
        organiserName:         organiserName.trim(),
        contactEmail,
        contactEmailVisible,
      },
    });

    if (!res.ok) {
      setError(res.error);
      setIsLoading(false);
      return;
    }

    router.replace(mode === "admin" ? "/admin/events" : "/events?submitted=1");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
      {error && <ErrorBanner>{error}</ErrorBanner>}

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

      {showTurnstile && <TurnstileWidget onToken={setTurnstileToken} />}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-3 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : editingId ? (
          "Save changes"
        ) : mode === "admin" ? (
          "Publish event"
        ) : (
          "Submit for review"
        )}
      </button>
    </form>
  );
}


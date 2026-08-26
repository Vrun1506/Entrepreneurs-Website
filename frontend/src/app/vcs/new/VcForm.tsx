"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/forms/Field";
import { ErrorBanner } from "@/components/forms/Banners";
import { inputCls } from "@/components/forms/styles";
import { TurnstileWidget, turnstileConfigured } from "@/components/forms/TurnstileWidget";
import { submitVcGrant, updateOwnVcGrant } from "@/app/vcs/actions";
import { Button } from "@/components/ui/Button";

type Mode = "user" | "admin";

export type VcInitialValues = {
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string;
  deadline: string;
  stage: string;
};

export default function VcForm({
  mode, editingId, initialValues,
}: {
  mode: Mode;
  editingId?: string;
  initialValues?: VcInitialValues;
}) {
  const router = useRouter();

  const iv = initialValues;

  const [kind, setKind] = useState<"vc" | "grant">(iv?.kind ?? "vc");
  const [name, setName] = useState(iv?.name ?? "");
  const [description, setDescription] = useState(iv?.description ?? "");
  const [link, setLink] = useState(iv?.link ?? "");
  const [amount, setAmount] = useState(iv?.amount ?? "");
  const [deadline, setDeadline] = useState(iv?.deadline ?? "");
  const [stage, setStage] = useState(iv?.stage ?? "");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");

  const showTurnstile = mode === "user" && !editingId && turnstileConfigured;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Name is required."); return;
    }
    if (description.trim().length < 20) {
      setError("Description must be at least 20 characters."); return;
    }
    if (!/^https?:\/\//i.test(link.trim())) {
      setError("Link must be a valid URL."); return;
    }
    if (showTurnstile && !turnstileToken) {
      setError("Please complete the verification challenge below."); return;
    }

    setIsLoading(true);

    if (editingId) {
      const res = await updateOwnVcGrant(editingId, {
        kind,
        name:        name.trim(),
        description: description.trim(),
        link:        link.trim(),
        amount:      amount.trim() || null,
        deadline:    deadline || null,
        stage:       stage.trim() || null,
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

    const res = await submitVcGrant({
      mode,
      turnstileToken,
      payload: {
        kind,
        name:        name.trim(),
        description: description.trim(),
        link:        link.trim(),
        amount:      amount.trim() || null,
        deadline:    deadline || null,
        stage:       stage.trim() || null,
      },
    });

    if (!res.ok) {
      setError(res.error);
      setIsLoading(false);
      return;
    }

    router.replace(mode === "admin" ? "/admin/vcs" : "/vcs?submitted=1");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Field label="Kind" required>
        <div className="grid grid-cols-2 gap-3">
          <label className={`px-4 py-3 rounded-lg border cursor-pointer transition-colors ${kind === "vc" ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30"}`}>
            <input type="radio" name="kind" value="vc" checked={kind === "vc"} onChange={() => setKind("vc")} className="mr-2" />
            Venture capital
          </label>
          <label className={`px-4 py-3 rounded-lg border cursor-pointer transition-colors ${kind === "grant" ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30"}`}>
            <input type="radio" name="kind" value="grant" checked={kind === "grant"} onChange={() => setKind("grant")} className="mr-2" />
            Grant
          </label>
        </div>
      </Field>

      <Field label="Name" required>
        <input type="text" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
      </Field>

      <Field label="Description" required hint={`${description.length}/5000`}>
        <textarea rows={5} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} required />
      </Field>

      <Field label="Link" required hint="Their site, application form, or fund page">
        <input type="url" maxLength={512} placeholder="https://example.com" value={link} onChange={(e) => setLink(e.target.value)} className={inputCls} required />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Amount" hint="optional">
          <input type="text" placeholder="e.g. £25k–£500k" maxLength={100} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Stage" hint="optional">
          <input type="text" placeholder="e.g. Pre-seed, Seed" maxLength={100} value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Deadline" hint="optional">
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </Field>
      </div>

      {showTurnstile && <TurnstileWidget onToken={setTurnstileToken} />}

      <Button
        type="submit"
        loading={isLoading}
        variant="primary"
        size="lg"
        className="w-full mt-3"
      >
        {editingId ? (
          "Save changes"
        ) : mode === "admin" ? (
          "Publish listing"
        ) : (
          "Submit for review"
        )}
      </Button>
    </form>
  );
}


"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "user" | "admin";

export default function VcForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const supabase = createClient();

  const [kind, setKind] = useState<"vc" | "grant">("vc");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [amount, setAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [stage, setStage] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

    setIsLoading(true);
    const rpc = mode === "admin" ? "admin_create_vc_grant" : "submit_vc_grant";
    const { error: rpcError } = await supabase.rpc(rpc, {
      p_kind:        kind,
      p_name:        name.trim(),
      p_description: description.trim(),
      p_link:        link.trim(),
      p_amount:      amount.trim() || null,
      p_deadline:    deadline || null,
      p_stage:       stage.trim() || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }

    router.replace(mode === "admin" ? "/admin/vcs" : "/vcs?submitted=1");
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
        <input type="url" placeholder="https://example.com" value={link} onChange={(e) => setLink(e.target.value)} className={inputCls} required />
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

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-3 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : mode === "admin" ? (
          "Publish listing"
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

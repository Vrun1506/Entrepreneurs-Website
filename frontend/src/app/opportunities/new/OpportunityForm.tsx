"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Lookup = { id: number; name: string };
type Mode = "user" | "admin";

type Props = {
  signupEmail: string;
  skills: Lookup[];
  sectors: Lookup[];
  mode: Mode;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const START_YEARS = (() => {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now; y <= now + 5; y++) out.push(y);
  return out;
})();

export default function OpportunityForm({ signupEmail, skills, sectors, mode }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [positionName, setPositionName] = useState("");
  const [company, setCompany] = useState("");
  const [pay, setPay] = useState("");
  const [locationType, setLocationType] = useState<"remote" | "hybrid" | "onsite">("hybrid");
  const [locationText, setLocationText] = useState("");
  const [description, setDescription] = useState("");
  const [startMonth, setStartMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [startYear, setStartYear] = useState<string>(String(new Date().getFullYear()));
  const [applicationDeadline, setApplicationDeadline] = useState<string>("");
  const [useCustomContact, setUseCustomContact] = useState(false);
  const [customContactEmail, setCustomContactEmail] = useState("");
  const [contactEmailVisible, setContactEmailVisible] = useState(false);
  const [applyMethod, setApplyMethod] = useState<"email" | "link">("email");
  const [applyUrl, setApplyUrl] = useState("");
  const [skillIds, setSkillIds] = useState<Set<number>>(new Set());
  const [sectorIds, setSectorIds] = useState<Set<number>>(new Set());

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (set: Set<number>, id: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (positionName.trim().length < 2) {
      setError("Role title is required."); return;
    }
    if (!company.trim()) {
      setError("Company is required."); return;
    }
    if (!pay.trim()) {
      setError("Salary / compensation is required."); return;
    }
    if (description.trim().length < 20) {
      setError("Description must be at least 20 characters."); return;
    }
    if (!applicationDeadline) {
      setError("Application deadline is required."); return;
    }
    if (new Date(applicationDeadline) < new Date(new Date().toDateString())) {
      setError("Application deadline must be today or later."); return;
    }
    if (locationType !== "remote" && !locationText.trim()) {
      setError("Please provide a location (city/region) for hybrid or onsite roles."); return;
    }
    if (applyMethod === "link") {
      const url = applyUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        setError("Application portal URL must start with http:// or https://"); return;
      }
    }

    const contactEmail = useCustomContact
      ? customContactEmail.trim()
      : signupEmail;
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(contactEmail)) {
      setError("Contact email is invalid."); return;
    }

    setIsLoading(true);
    const rpc = mode === "admin" ? "admin_create_opportunity" : "submit_opportunity";
    const { error: rpcError } = await supabase.rpc(rpc, {
      p_position_name:         positionName.trim(),
      p_company:               company.trim(),
      p_pay:                   pay.trim(),
      p_location_type:         locationType,
      p_location_text:         locationText.trim() || null,
      p_description:           description.trim(),
      p_start_month:           parseInt(startMonth, 10),
      p_start_year:            parseInt(startYear,  10),
      p_application_deadline:  applicationDeadline,
      p_contact_email:         contactEmail,
      p_contact_email_visible: contactEmailVisible,
      p_apply_method:          applyMethod,
      p_apply_url:             applyMethod === "link" ? applyUrl.trim() : null,
      p_skill_ids:             Array.from(skillIds),
      p_sector_ids:            Array.from(sectorIds),
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }

    router.replace(mode === "admin" ? "/admin/opportunities" : "/opportunities?submitted=1");
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

      <Field label="Role title" required>
        <input type="text" maxLength={200} value={positionName} onChange={(e) => setPositionName(e.target.value)} className={inputCls} required />
      </Field>

      <Field label="Company" required>
        <input type="text" maxLength={200} value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} required />
      </Field>

      <Field label="Salary / compensation" required hint="e.g. £80k–£100k, equity 0.1–0.5%, daily rate, etc.">
        <input type="text" maxLength={100} value={pay} onChange={(e) => setPay(e.target.value)} className={inputCls} required />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Location type" required>
          <select value={locationType} onChange={(e) => setLocationType(e.target.value as "remote" | "hybrid" | "onsite")} className={inputCls}>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="City / region" hint={locationType === "remote" ? "Optional for remote" : "Required"}>
            <input type="text" maxLength={200} value={locationText} onChange={(e) => setLocationText(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </div>

      <Field label="Job description" required hint={`${description.length}/5000`}>
        <textarea rows={6} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} required />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Start month" required>
          <select value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className={inputCls}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Start year" required>
          <select value={startYear} onChange={(e) => setStartYear(e.target.value)} className={inputCls}>
            {START_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Final date to apply" required>
          <input type="date" value={applicationDeadline} onChange={(e) => setApplicationDeadline(e.target.value)} className={inputCls} required />
        </Field>
      </div>

      <div className="pt-2 border-t border-border-subtle">
        <div className="text-[0.85rem] text-text-primary mb-3 mt-3">Contact email</div>
        <p className="text-[0.75rem] text-text-muted leading-relaxed mb-3">
          We&apos;ll use the email you signed up with by default. Tick below to use a different inbox.
          Either way, the admin team always sees your signup email.
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
            Make this contact email visible to community members on the listing.
            <span className="text-text-muted block text-[0.75rem] mt-0.5">If unchecked, applicants will have to reach out via LinkedIn or the application portal below.</span>
          </span>
        </label>
      </div>

      <div className="pt-2 border-t border-border-subtle">
        <div className="text-[0.85rem] text-text-primary mb-3 mt-3">How should applicants apply?</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className={`px-4 py-3 rounded-lg border cursor-pointer transition-colors ${applyMethod === "email" ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30"}`}>
            <input type="radio" name="apply-method" value="email" checked={applyMethod === "email"} onChange={() => setApplyMethod("email")} className="mr-2" />
            Contact me directly
          </label>
          <label className={`px-4 py-3 rounded-lg border cursor-pointer transition-colors ${applyMethod === "link" ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30"}`}>
            <input type="radio" name="apply-method" value="link" checked={applyMethod === "link"} onChange={() => setApplyMethod("link")} className="mr-2" />
            Application portal link
          </label>
        </div>
        {applyMethod === "link" && (
          <div className="mt-3">
            <input type="url" placeholder="https://yourcompany.com/careers/role-id" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} className={inputCls} required />
          </div>
        )}
      </div>

      <ChipGroup label="Skills" items={skills} selected={skillIds} onToggle={(id) => toggle(skillIds, id, setSkillIds)} />
      <ChipGroup label="Sectors" items={sectors} selected={sectorIds} onToggle={(id) => toggle(sectorIds, id, setSectorIds)} />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-3 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : mode === "admin" ? (
          "Publish opportunity"
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

function ChipGroup({
  label, items, selected, onToggle,
}: { label: string; items: Lookup[]; selected: Set<number>; onToggle: (id: number) => void }) {
  return (
    <div>
      <div className="block text-[0.75rem] text-text-muted mb-2">
        {label} <span className="text-text-muted/70">— optional</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${on ? "bg-gold-muted border-gold/50 text-gold-light" : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"}`}
            >
              {it.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

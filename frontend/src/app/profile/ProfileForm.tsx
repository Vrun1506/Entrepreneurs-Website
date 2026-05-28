"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Lookup = { id: number; name: string };

type Props = {
  role: "alum" | "student";
  firstName: string;
  surname: string;
  linkedinUrl: string;
  githubUrl: string;
  gradYear: number | null;
  bio: string;
  workingOn: string;
  skills: Lookup[];
  sectors: Lookup[];
  selectedSkills: number[];
  selectedSectors: number[];
};

const LINKEDIN_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i;
const GITHUB_RE   = /^https?:\/\/([a-z0-9-]+\.)*github\.com\//i;

const GRAD_YEARS = (() => {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now + 5; y >= 1960; y--) out.push(y);
  return out;
})();

export default function ProfileForm(props: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [firstName, setFirstName] = useState(props.firstName);
  const [surname, setSurname] = useState(props.surname);
  const [linkedin, setLinkedin] = useState(props.linkedinUrl);
  const [github, setGithub] = useState(props.githubUrl);
  const [gradYear, setGradYear] = useState<string>(props.gradYear?.toString() ?? "");
  const [bio, setBio] = useState(props.bio);
  const [workingOn, setWorkingOn] = useState(props.workingOn);
  const [skillIds, setSkillIds] = useState<Set<number>>(new Set(props.selectedSkills));
  const [sectorIds, setSectorIds] = useState<Set<number>>(new Set(props.selectedSectors));

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const toggle = (set: Set<number>, id: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    if (!firstName.trim() || !surname.trim()) {
      setError("First name and surname are required.");
      return;
    }
    if (!LINKEDIN_RE.test(linkedin.trim())) {
      setError("Please enter a valid LinkedIn URL.");
      return;
    }
    if (github.trim() && !GITHUB_RE.test(github.trim())) {
      setError("Please enter a valid GitHub URL or leave it blank.");
      return;
    }
    let gradYearNum: number | null = null;
    if (props.role === "alum") {
      gradYearNum = parseInt(gradYear, 10);
      if (!gradYearNum || gradYearNum < 1950 || gradYearNum > 2099) {
        setError("Please pick a valid graduation year.");
        return;
      }
    }
    if (bio.length > 1000) {
      setError("Bio must be 1000 characters or fewer.");
      return;
    }
    if (workingOn.length > 500) {
      setError("\"What you're working on\" must be 500 characters or fewer.");
      return;
    }

    setIsLoading(true);
    const { error: rpcError } = await supabase.rpc("update_profile", {
      p_first_name:   firstName.trim(),
      p_surname:      surname.trim(),
      p_linkedin_url: linkedin.trim(),
      p_github_url:   github.trim() || null,
      p_grad_year:    gradYearNum,
      p_bio:          bio.trim() || null,
      p_working_on:   workingOn.trim() || null,
      p_skill_ids:    Array.from(skillIds),
      p_sector_ids:   Array.from(sectorIds),
    });

    if (rpcError) {
      setError(rpcError.message);
      setIsLoading(false);
      return;
    }

    setSaved(true);
    setIsLoading(false);
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
      {saved && !error && (
        <div className="px-4 py-3 rounded-lg bg-gold-muted border border-gold/30 text-[0.8rem] text-gold-light leading-relaxed">
          Saved.
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="first-name" className="block text-[0.75rem] text-text-muted mb-1.5">First name</label>
          <input id="first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} required />
        </div>
        <div className="flex-1">
          <label htmlFor="surname" className="block text-[0.75rem] text-text-muted mb-1.5">Surname</label>
          <input id="surname" type="text" value={surname} onChange={(e) => setSurname(e.target.value)} className={inputCls} required />
        </div>
      </div>

      <div>
        <label htmlFor="linkedin" className="block text-[0.75rem] text-text-muted mb-1.5">LinkedIn URL</label>
        <input id="linkedin" type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className={inputCls} required />
      </div>

      <div>
        <label htmlFor="github" className="block text-[0.75rem] text-text-muted mb-1.5">
          GitHub URL <span className="text-text-muted/70 ml-1">— optional</span>
        </label>
        <input
          id="github"
          type="url"
          placeholder="https://github.com/your-handle"
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          className={inputCls}
        />
      </div>

      {props.role === "alum" && (
        <div>
          <label htmlFor="grad-year" className="block text-[0.75rem] text-text-muted mb-1.5">Graduation year</label>
          <select id="grad-year" value={gradYear} onChange={(e) => setGradYear(e.target.value)} className={inputCls} required>
            <option value="">Select a year</option>
            {GRAD_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="bio" className="block text-[0.75rem] text-text-muted mb-1.5">
          Short bio <span className="text-text-muted/70 ml-2">{bio.length}/1000</span>
        </label>
        <textarea id="bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} className={`${inputCls} resize-none`} maxLength={1000} />
      </div>

      <div>
        <label htmlFor="working-on" className="block text-[0.75rem] text-text-muted mb-1.5">
          What are you working on? <span className="text-text-muted/70 ml-2">{workingOn.length}/500</span>
        </label>
        <textarea id="working-on" rows={2} value={workingOn} onChange={(e) => setWorkingOn(e.target.value)} className={`${inputCls} resize-none`} maxLength={500} />
      </div>

      <ChipGroup label="Skills"  items={props.skills}  selected={skillIds}  onToggle={(id) => toggle(skillIds, id, setSkillIds)} />
      <ChipGroup label="Sectors" items={props.sectors} selected={sectorIds} onToggle={(id) => toggle(sectorIds, id, setSectorIds)} />

      <button
        type="submit"
        disabled={isLoading}
        className="w-full mt-3 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : (
          "Save changes"
        )}
      </button>
    </form>
  );
}

function ChipGroup({
  label, items, selected, onToggle,
}: {
  label: string; items: Lookup[]; selected: Set<number>; onToggle: (id: number) => void;
}) {
  return (
    <div>
      <div className="block text-[0.75rem] text-text-muted mb-2">
        {label} <span className="text-text-muted/70">— optional, pick any that fit</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`px-3 py-1.5 rounded-full text-[0.775rem] border transition-colors duration-150 cursor-pointer ${
                on
                  ? "bg-gold-muted border-gold/50 text-gold-light"
                  : "bg-white/[0.02] border-border text-text-secondary hover:border-gold/30 hover:text-text-primary"
              }`}
            >
              {it.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

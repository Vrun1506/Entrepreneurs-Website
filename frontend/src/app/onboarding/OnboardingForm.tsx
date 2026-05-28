"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Lookup = { id: number; name: string };

type Props = {
  role: "alum" | "student";
  firstName: string;
  surname: string;
  skills: Lookup[];
  sectors: Lookup[];
};

const LINKEDIN_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i;
const GITHUB_RE   = /^https?:\/\/([a-z0-9-]+\.)*github\.com\//i;

const GRAD_YEARS = (() => {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now + 5; y >= 1960; y--) out.push(y);
  return out;
})();

export default function OnboardingForm({ role, firstName, surname, skills, sectors }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [gradYear, setGradYear] = useState<string>("");
  const [bio, setBio] = useState("");
  const [workingOn, setWorkingOn] = useState("");
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

    if (!LINKEDIN_RE.test(linkedin.trim())) {
      setError("Please enter a valid LinkedIn URL (e.g. https://www.linkedin.com/in/your-handle).");
      return;
    }
    if (github.trim() && !GITHUB_RE.test(github.trim())) {
      setError("Please enter a valid GitHub URL (e.g. https://github.com/your-handle) or leave it blank.");
      return;
    }
    let gradYearNum: number | null = null;
    if (role === "alum") {
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
    const { error: rpcError } = await supabase.rpc("submit_onboarding", {
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

    router.replace(role === "alum" ? "/pending" : "/community");
    router.refresh();
  };

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col">
      <header className="px-8 py-5">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="w-7 h-7 rounded-md bg-gold flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="#0c0c0b" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-display text-[1.1rem] text-text-primary tracking-tight">Foundry</span>
          </Link>
          <span className="text-[0.8rem] text-text-muted">
            Signed in as <span className="text-text-secondary">{firstName} {surname}</span>
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-8 py-12">
        <div className="w-full max-w-[640px]">
          <div className="text-center mb-10">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-3">Step 1 of 1</div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight mb-4 text-[clamp(2rem,4vw,2.75rem)]">
              Tell us about <em className="text-gold">yourself.</em>
            </h1>
            <p className="text-[0.9rem] text-text-secondary font-light leading-[1.7]">
              {role === "alum"
                ? "Help us verify your Imperial connection and your work."
                : "Help your peers find you in the directory."}
              <br />
              <span className="text-text-muted text-[0.825rem]">
                You can edit any of this later from your profile page.
              </span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
            {error && (
              <div className="px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="linkedin" className="block text-[0.75rem] text-text-muted mb-1.5">
                LinkedIn URL <span className="text-[#ff6b6b]">*</span>
              </label>
              <input
                id="linkedin"
                type="url"
                placeholder="https://www.linkedin.com/in/your-handle"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                className={inputCls}
                required
              />
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

            {role === "alum" && (
              <div>
                <label htmlFor="grad-year" className="block text-[0.75rem] text-text-muted mb-1.5">
                  Graduation year <span className="text-[#ff6b6b]">*</span>
                </label>
                <select
                  id="grad-year"
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                  className={inputCls}
                  required
                >
                  <option value="">Select a year</option>
                  {GRAD_YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="bio" className="block text-[0.75rem] text-text-muted mb-1.5">
                Short bio
                <span className="text-text-muted/70 ml-2">{bio.length}/1000</span>
              </label>
              <textarea
                id="bio"
                rows={3}
                placeholder="A few lines about you — background, what you've built, what you're known for."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={`${inputCls} resize-none`}
                maxLength={1000}
              />
            </div>

            <div>
              <label htmlFor="working-on" className="block text-[0.75rem] text-text-muted mb-1.5">
                What are you working on?
                <span className="text-text-muted/70 ml-2">{workingOn.length}/500</span>
              </label>
              <textarea
                id="working-on"
                rows={2}
                placeholder="A current project, company, or research focus."
                value={workingOn}
                onChange={(e) => setWorkingOn(e.target.value)}
                className={`${inputCls} resize-none`}
                maxLength={500}
              />
            </div>

            <ChipGroup
              label="Skills"
              items={skills}
              selected={skillIds}
              onToggle={(id) => toggle(skillIds, id, setSkillIds)}
            />

            <ChipGroup
              label="Sectors"
              items={sectors}
              selected={sectorIds}
              onToggle={(id) => toggle(sectorIds, id, setSectorIds)}
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {isLoading ? (
                <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
              ) : (
                "Submit for review"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function ChipGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: Lookup[];
  selected: Set<number>;
  onToggle: (id: number) => void;
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

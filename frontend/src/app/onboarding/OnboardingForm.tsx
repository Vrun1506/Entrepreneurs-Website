"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import { ChipGroup, type ChipItem } from "@/components/forms/ChipGroup";
import { ErrorBanner } from "@/components/forms/Banners";
import { inputCls } from "@/components/forms/styles";
import { cleanText } from "@/lib/text";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type Lookup = ChipItem;

type Props = {
  role: "alum" | "student";
  firstName: string;
  surname: string;
  skills: Lookup[];
  sectors: Lookup[];
};

const LINKEDIN_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i;
const GITHUB_RE   = /^https?:\/\/([a-z0-9-]+\.)*github\.com\//i;
const URL_RE      = /^https?:\/\/.+/i;

const TOTAL_STEPS = 4;
const STEP_TITLES = ["Your studies", "About you", "Interests & expertise", "Links"];

const GRAD_YEARS = (() => {
  const now = new Date().getFullYear();
  const out: number[] = [];
  for (let y = now + 6; y >= 1960; y--) out.push(y);
  return out;
})();

export default function OnboardingForm({ role, firstName, surname, skills, sectors }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [course, setCourse] = useState("");
  const [gradYear, setGradYear] = useState<string>("");
  const [bio, setBio] = useState("");
  const [workingOn, setWorkingOn] = useState("");
  const [skillIds, setSkillIds] = useState<Set<number>>(new Set());
  const [sectorIds, setSectorIds] = useState<Set<number>>(new Set());
  const [linkedin, setLinkedin] = useState("");
  const [github, setGithub] = useState("");
  const [portfolio, setPortfolio] = useState("");

  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (set: Set<number>, id: number, setter: (s: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const validateStep = (s: number): string | null => {
    if (s === 0) {
      const c = cleanText(course);
      if (!c) return "Course is required.";
      if (c.length > 200) return "Course must be 200 characters or fewer.";
      const y = parseInt(gradYear, 10);
      if (!y || y < 1950 || y > 2099) return "Please pick a valid graduation year.";
    }
    if (s === 1) {
      if (bio.length > 1000) return "Bio must be 1000 characters or fewer.";
      if (workingOn.length > 500) return "\"What you're working on\" must be 500 characters or fewer.";
    }
    if (s === 3) {
      const lk = cleanText(linkedin);
      const gh = cleanText(github);
      const pf = cleanText(portfolio);
      if (role === "alum" && !lk) return "LinkedIn URL is required for alumni.";
      if (lk && !LINKEDIN_RE.test(lk)) return "Please enter a valid LinkedIn URL.";
      if (gh && !GITHUB_RE.test(gh)) return "Please enter a valid GitHub URL or leave it blank.";
      if (pf && !URL_RE.test(pf)) return "Portfolio URL must start with http:// or https://.";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };

  const handleBack = () => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }

    setIsLoading(true);
    const { error: rpcError } = await supabase.rpc("submit_onboarding", {
      p_course:        cleanText(course),
      p_grad_year:     parseInt(gradYear, 10),
      p_linkedin_url:  cleanText(linkedin) || null,
      p_github_url:    cleanText(github) || null,
      p_portfolio_url: cleanText(portfolio) || null,
      p_bio:           cleanText(bio) || null,
      p_working_on:    cleanText(workingOn) || null,
      p_skill_ids:     Array.from(skillIds),
      p_sector_ids:    Array.from(sectorIds),
    });
    if (rpcError) {
      setError(describeSupabaseError(rpcError));
      setIsLoading(false);
      return;
    }
    router.replace(role === "alum" ? "/pending" : "/community");
    router.refresh();
  };

  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col">
      <header className="sticky top-0 z-40 px-8 py-5 bg-bg-primary/90 backdrop-blur-md border-b border-border-subtle">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <Link href="/" className="no-underline">
            <BrandLogo size="sm" />
          </Link>
          <span className="text-[0.8rem] text-text-muted">
            Signed in as <span className="text-text-secondary">{firstName} {surname}</span>
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-8 py-12">
        <div className="w-full max-w-[640px]">
          <div className="text-center mb-8">
            <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-3">
              Step {step + 1} of {TOTAL_STEPS} · {STEP_TITLES[step]}
            </div>
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight mb-4 text-[clamp(2rem,4vw,2.75rem)]">
              Tell us about <em className="text-gold">yourself.</em>
            </h1>
            <p className="text-[0.9rem] text-text-secondary font-light leading-[1.7]">
              {role === "alum"
                ? "Help us verify your Imperial connection and your work."
                : "Help your peers find you in the directory."}
              <br />
              <span className="text-text-muted text-[0.825rem]">
                You can go back to any step. You can edit any of this later from your profile.
              </span>
            </p>
          </div>

          <ProgressBar current={step + 1} total={TOTAL_STEPS} />

          <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-2xl bg-bg-card border border-border-subtle p-8">
            {error && <ErrorBanner>{error}</ErrorBanner>}

            {step === 0 && (
              <EducationStep
                role={role}
                course={course} setCourse={setCourse}
                gradYear={gradYear} setGradYear={setGradYear}
                inputCls={inputCls}
              />
            )}
            {step === 1 && (
              <AboutStep
                bio={bio} setBio={setBio}
                workingOn={workingOn} setWorkingOn={setWorkingOn}
                inputCls={inputCls}
              />
            )}
            {step === 2 && (
              <InterestsStep
                skills={skills} skillIds={skillIds}
                sectors={sectors} sectorIds={sectorIds}
                onToggleSkill={(id) => toggle(skillIds, id, setSkillIds)}
                onToggleSector={(id) => toggle(sectorIds, id, setSectorIds)}
              />
            )}
            {step === 3 && (
              <LinksStep
                role={role}
                linkedin={linkedin} setLinkedin={setLinkedin}
                github={github} setGithub={setGithub}
                portfolio={portfolio} setPortfolio={setPortfolio}
                inputCls={inputCls}
              />
            )}

            <div className="pt-2 flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="px-5 py-3 rounded-xl bg-white/[0.03] border border-border text-[0.85rem] text-text-secondary hover:border-border-strong hover:text-text-primary cursor-pointer transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Back
                </button>
              )}
              {step < TOTAL_STEPS - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {isLoading ? (
                    <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
                  ) : (
                    role === "alum" ? "Submit for review" : "Finish onboarding"
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <div className="space-y-2" aria-label={`Step ${current} of ${total}`}>
      <div className="h-1 w-full rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full bg-gold transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[0.7rem] text-text-muted">
        <span>{current} / {total}</span>
        <span>{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

function EducationStep({
  role, course, setCourse, gradYear, setGradYear, inputCls,
}: {
  role: "alum" | "student";
  course: string; setCourse: (v: string) => void;
  gradYear: string; setGradYear: (v: string) => void;
  inputCls: string;
}) {
  return (
    <>
      <div>
        <label htmlFor="course" className="block text-[0.75rem] text-text-muted mb-1.5">
          {role === "alum" ? "Course studied" : "Course you're studying"} <span className="text-[#ff6b6b]">*</span>
        </label>
        <input
          id="course"
          type="text"
          placeholder={role === "alum" ? "e.g. MEng Computing" : "e.g. BSc Mathematics"}
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className={inputCls}
          maxLength={200}
          required
        />
      </div>
      <div>
        <label htmlFor="grad-year" className="block text-[0.75rem] text-text-muted mb-1.5">
          {role === "alum" ? "Graduation year" : "Expected graduation year"} <span className="text-[#ff6b6b]">*</span>
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
    </>
  );
}

function AboutStep({
  bio, setBio, workingOn, setWorkingOn, inputCls,
}: {
  bio: string; setBio: (v: string) => void;
  workingOn: string; setWorkingOn: (v: string) => void;
  inputCls: string;
}) {
  return (
    <>
      <div>
        <label htmlFor="bio" className="block text-[0.75rem] text-text-muted mb-1.5">
          Short bio <span className="text-text-muted/70 ml-1">— optional</span>
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
          What are you working on? <span className="text-text-muted/70 ml-1">— optional</span>
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
    </>
  );
}

function InterestsStep({
  skills, skillIds, sectors, sectorIds, onToggleSkill, onToggleSector,
}: {
  skills: Lookup[]; skillIds: Set<number>;
  sectors: Lookup[]; sectorIds: Set<number>;
  onToggleSkill: (id: number) => void;
  onToggleSector: (id: number) => void;
}) {
  return (
    <>
      <ChipGroup
        label="Sectors you're interested in"
        items={sectors}
        selected={sectorIds}
        onToggle={onToggleSector}
      />
      <ChipGroup
        label="Skills and expertise"
        items={skills}
        selected={skillIds}
        onToggle={onToggleSkill}
      />
    </>
  );
}

function LinksStep({
  role, linkedin, setLinkedin, github, setGithub, portfolio, setPortfolio, inputCls,
}: {
  role: "alum" | "student";
  linkedin: string; setLinkedin: (v: string) => void;
  github: string; setGithub: (v: string) => void;
  portfolio: string; setPortfolio: (v: string) => void;
  inputCls: string;
}) {
  return (
    <>
      <div>
        <label htmlFor="linkedin" className="block text-[0.75rem] text-text-muted mb-1.5">
          LinkedIn URL{" "}
          {role === "alum"
            ? <span className="text-[#ff6b6b]">*</span>
            : <span className="text-text-muted/70 ml-1">— optional</span>}
        </label>
        <input
          id="linkedin"
          type="url"
          placeholder="https://www.linkedin.com/in/your-handle"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          className={inputCls}
          required={role === "alum"}
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
      <div>
        <label htmlFor="portfolio" className="block text-[0.75rem] text-text-muted mb-1.5">
          Portfolio URL <span className="text-text-muted/70 ml-1">— optional</span>
        </label>
        <input
          id="portfolio"
          type="url"
          placeholder="https://yourportfolio.com"
          value={portfolio}
          onChange={(e) => setPortfolio(e.target.value)}
          className={inputCls}
        />
      </div>
    </>
  );
}


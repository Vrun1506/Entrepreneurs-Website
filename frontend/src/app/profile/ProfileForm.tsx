"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChipGroup, type ChipItem } from "@/components/forms/ChipGroup";
import { ErrorBanner, SuccessBanner } from "@/components/forms/Banners";
import { inputCls } from "@/components/forms/styles";
import { cleanName, cleanText, isValidName } from "@/lib/text";
import { gradYearOptions, validateGradYear } from "@/lib/gradYears";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/Button";
import { invalidateDirectoryCache } from "@/app/profile/actions";

type Lookup = ChipItem;

type Props = {
  role: "alum" | "student";
  firstName: string;
  surname: string;
  course: string;
  gradYear: number | null;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  bio: string;
  workingOn: string;
  skills: Lookup[];
  sectors: Lookup[];
  selectedSkills: number[];
  selectedSectors: number[];
};

const LINKEDIN_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i;
const GITHUB_RE   = /^https?:\/\/([a-z0-9-]+\.)*github\.com\//i;
const URL_RE      = /^https?:\/\/.+/i;

export default function ProfileForm(props: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [firstName, setFirstName] = useState(props.firstName);
  const [surname, setSurname] = useState(props.surname);
  const [course, setCourse] = useState(props.course);
  const [gradYear, setGradYear] = useState<string>(props.gradYear?.toString() ?? "");
  const [linkedin, setLinkedin] = useState(props.linkedinUrl);
  const [github, setGithub] = useState(props.githubUrl);
  const [portfolio, setPortfolio] = useState(props.portfolioUrl);
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

    const trimmedFirst = cleanName(firstName);
    const trimmedSurname = cleanName(surname);
    const cleanedCourse = cleanText(course);
    if (!trimmedFirst || !trimmedSurname) {
      setError("First name and surname are required.");
      return;
    }
    if (trimmedFirst.length > 50 || trimmedSurname.length > 50) {
      setError("First name and surname must be 50 characters or fewer.");
      return;
    }
    if (!isValidName(trimmedFirst) || !isValidName(trimmedSurname)) {
      setError("Names can only contain letters, spaces, hyphens, apostrophes and periods.");
      return;
    }
    if (!cleanedCourse) {
      setError("Course is required.");
      return;
    }
    if (cleanedCourse.length > 200) {
      setError("Course must be 200 characters or fewer.");
      return;
    }
    const gradYearNum = parseInt(gradYear, 10);
    if (!gradYearNum) {
      setError("Please pick a valid graduation year.");
      return;
    }
    const gradYearErr = validateGradYear(props.role, gradYearNum);
    if (gradYearErr) {
      setError(gradYearErr);
      return;
    }
    if (props.role === "alum" && !linkedin.trim()) {
      setError("LinkedIn URL is required for alumni.");
      return;
    }
    if (linkedin.trim() && !LINKEDIN_RE.test(linkedin.trim())) {
      setError("Please enter a valid LinkedIn URL.");
      return;
    }
    if (github.trim() && !GITHUB_RE.test(github.trim())) {
      setError("Please enter a valid GitHub URL or leave it blank.");
      return;
    }
    if (portfolio.trim() && !URL_RE.test(portfolio.trim())) {
      setError("Portfolio URL must start with http:// or https://.");
      return;
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
      p_first_name:    trimmedFirst,
      p_surname:       trimmedSurname,
      p_course:        cleanedCourse,
      p_grad_year:     gradYearNum,
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

    setSaved(true);
    setIsLoading(false);
    // The RPC above ran client-side, so nothing on the server knows the
    // directory changed. Tell it before refreshing.
    await invalidateDirectoryCache();
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border p-8">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {saved && !error && <SuccessBanner>Saved.</SuccessBanner>}

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="first-name" className="block text-[0.75rem] text-text-muted mb-1.5">First name</label>
          <input id="first-name" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} maxLength={50} required />
        </div>
        <div className="flex-1">
          <label htmlFor="surname" className="block text-[0.75rem] text-text-muted mb-1.5">Surname</label>
          <input id="surname" type="text" value={surname} onChange={(e) => setSurname(e.target.value)} className={inputCls} maxLength={50} required />
        </div>
      </div>

      <div>
        <label htmlFor="course" className="block text-[0.75rem] text-text-muted mb-1.5">
          {props.role === "alum" ? "Course studied" : "Course you're studying"}
        </label>
        <input
          id="course"
          type="text"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          className={inputCls}
          maxLength={200}
          placeholder={props.role === "alum" ? "e.g. MEng Computing" : "e.g. BSc Mathematics"}
          required
        />
      </div>

      <div>
        <label htmlFor="grad-year" className="block text-[0.75rem] text-text-muted mb-1.5">
          {props.role === "alum" ? "Graduation year" : "Expected graduation year"}
        </label>
        <select id="grad-year" value={gradYear} onChange={(e) => setGradYear(e.target.value)} className={inputCls} required>
          <option value="">Select a year</option>
          {gradYearOptions(props.role).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="linkedin" className="block text-[0.75rem] text-text-muted mb-1.5">
          LinkedIn URL{" "}
          {props.role === "student" && (
            <span className="text-text-muted/70 ml-1">— optional</span>
          )}
        </label>
        <input
          id="linkedin"
          type="url"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          className={inputCls}
          maxLength={512}
          required={props.role === "alum"}
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
          maxLength={512}
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
          maxLength={512}
        />
      </div>

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

      <ChipGroup label="Sectors" items={props.sectors} selected={sectorIds} onToggle={(id) => toggle(sectorIds, id, setSectorIds)} />
      <ChipGroup label="Skills"  items={props.skills}  selected={skillIds}  onToggle={(id) => toggle(skillIds, id, setSkillIds)} />

      <Button
        type="submit"
        loading={isLoading}
        variant="primary"
        size="lg"
        className="w-full mt-3"
      >
        Save changes
      </Button>
    </form>
  );
}


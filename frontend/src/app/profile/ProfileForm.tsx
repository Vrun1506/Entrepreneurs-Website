"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChipGroup, type ChipItem } from "@/components/forms/ChipGroup";
import { ErrorBanner, SuccessBanner } from "@/components/forms/Banners";
import { inputCls } from "@/components/forms/styles";
import {
  Field, ChoiceCards, PillChoice, TagInput, FilePicker, RankPicker, SkillPicker, type SkillOption,
} from "@/components/intake/controls";
import { AvatarCropper } from "@/components/media/AvatarCropper";
import { cleanName, cleanText, isValidName } from "@/lib/text";
import { gradYearOptions, validateGradYear } from "@/lib/gradYears";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { Button } from "@/components/ui/Button";
import { invalidateDirectoryCache } from "@/app/profile/actions";
import {
  requestAvatarTicket, confirmAvatarUpload, removeAvatar,
  requestCvTicket, confirmCvUpload, removeCv, getMyCvDownloadUrl,
  getMySuggestedCvSkillIds,
} from "@/app/profile/mediaActions";
import type { Affiliation } from "@/lib/intake/steps";
import {
  MAX_CORE_SKILLS, MAX_INTENTS,
  CURRENT_FOCUS, VENTURE_STAGES, VENTURE_STAGES_WITH_DETAIL, RECRUITING_STATUSES,
  INTENTS, INTENT_URGENCIES, AVAILABILITY_HOURS,
} from "@/lib/intake/state";

// ════════════════════════════════════════════════════════════════════
// Foundry · My Profile
//
// Everything /intake collects stays editable here — it is all
// self-description that goes stale, and locking it guarantees a stale
// directory within two terms (ethereal-fluttering-blossom.md §4f). The
// three exceptions are handled elsewhere for the same reason each time:
// role/affiliation (AffiliationSection, its own re-check), status
// (trigger-locked), email (a verified change flow with an audit log).
//
// Photo and CV each write through their own RPC the moment they change
// (mediaActions.ts) — they are not part of the "Save changes" submit,
// which only covers the update_profile fields below.
// ════════════════════════════════════════════════════════════════════

type Props = {
  role: Affiliation;
  firstName: string;
  surname: string;
  course: string;
  gradYear: number | null;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  preferredName: string;
  bioFocus: string;
  bioHobbies: string;
  avatarUrl: string | null;
  cvOriginalFilename: string | null;
  cvUploadedAt: string | null;
  hasCv: boolean;
  currentFocus: string;
  ventureStage: string;
  ventureName: string;
  ventureUrl: string;
  ventureOneLiner: string;
  recruitingStatus: string;
  intentUrgency: string;
  availabilityHours: string;
  intents: string[];
  academicInterests: string[];
  hobbies: string[];
  skillTaxonomy: SkillOption[];
  sectors: ChipItem[];
  selectedSkillIds: number[];
  selectedCoreSkillIds: number[];
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

  const [preferredName, setPreferredName] = useState(props.preferredName);
  const [bioFocus, setBioFocus] = useState(props.bioFocus);
  const [bioHobbies, setBioHobbies] = useState(props.bioHobbies);

  const [skillIds, setSkillIds] = useState<number[]>(props.selectedSkillIds);
  const [coreSkillIds, setCoreSkillIds] = useState<number[]>(props.selectedCoreSkillIds);
  const [suggestedSkillIds, setSuggestedSkillIds] = useState<number[]>([]);
  const [sectorIds, setSectorIds] = useState<Set<number>>(new Set(props.selectedSectors));
  const [academicInterests, setAcademicInterests] = useState<string[]>(props.academicInterests);
  const [hobbies, setHobbies] = useState<string[]>(props.hobbies);

  const [currentFocus, setCurrentFocus] = useState(props.currentFocus);
  const [ventureStage, setVentureStage] = useState(props.ventureStage);
  const [ventureName, setVentureName] = useState(props.ventureName);
  const [ventureUrl, setVentureUrl] = useState(props.ventureUrl);
  const [ventureOneLiner, setVentureOneLiner] = useState(props.ventureOneLiner);
  const [recruitingStatus, setRecruitingStatus] = useState(props.recruitingStatus);

  const [intents, setIntents] = useState<string[]>(props.intents);
  const [intentUrgency, setIntentUrgency] = useState(props.intentUrgency);
  const [availabilityHours, setAvailabilityHours] = useState(props.availabilityHours);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const toggleSector = (id: number) => {
    const next = new Set(sectorIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSectorIds(next);
  };
  const toggleIntent = (v: string) =>
    setIntents((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : prev.length < MAX_INTENTS ? [...prev, v] : prev,
    );
  const toggleCoreSkill = (id: number) =>
    setCoreSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_CORE_SKILLS ? [...prev, id] : prev,
    );

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
    if (props.role !== "student" && !linkedin.trim()) {
      setError("A LinkedIn URL is required for accounts without an Imperial email address.");
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
    if (ventureUrl.trim() && !URL_RE.test(ventureUrl.trim())) {
      setError("Venture website must start with http:// or https://.");
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
      p_preferred_name: cleanText(preferredName) || null,
      p_bio_focus:      cleanText(bioFocus) || null,
      p_bio_hobbies:    cleanText(bioHobbies) || null,
      p_current_focus:  currentFocus || null,
      p_venture_stage:  ventureStage || null,
      p_venture_name:   cleanText(ventureName) || null,
      p_venture_url:    cleanText(ventureUrl) || null,
      p_venture_one_liner: cleanText(ventureOneLiner) || null,
      p_recruiting_status: recruitingStatus || null,
      p_intent_urgency:    intentUrgency || null,
      p_availability_hours: availabilityHours || null,
      p_skill_ids:      skillIds,
      p_core_skill_ids: coreSkillIds,
      p_sector_ids:     Array.from(sectorIds),
      p_academic_interests: academicInterests,
      p_hobbies:            hobbies,
      p_intents:            intents,
    });

    if (rpcError) {
      setError(describeSupabaseError(rpcError));
      setIsLoading(false);
      return;
    }

    setSaved(true);
    setIsLoading(false);
    await invalidateDirectoryCache();
    router.refresh();
  };

  const suggestedSkills = suggestedSkillIds
    .filter((id) => !skillIds.includes(id))
    .map((id) => props.skillTaxonomy.find((t) => t.id === id))
    .filter((t): t is SkillOption => !!t);

  const showVentureDetail = VENTURE_STAGES_WITH_DETAIL.has(ventureStage);

  return (
    <div className="space-y-8">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {saved && !error && <SuccessBanner>Saved.</SuccessBanner>}

      <PhotoSection avatarUrl={props.avatarUrl} />

      <CvSection
        originalFilename={props.cvOriginalFilename}
        uploadedAt={props.cvUploadedAt}
        hasCv={props.hasCv}
        onSuggested={(ids) => setSuggestedSkillIds((prev) => [...prev, ...ids])}
      />

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-bg-card border border-border p-8">
        <h2 className="mb-1 text-[1rem] font-medium text-text-primary">Identity</h2>

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
          <label htmlFor="preferred-name" className="block text-[0.75rem] text-text-muted mb-1.5">
            What people call you <span className="text-text-muted/70 ml-1">— optional</span>
          </label>
          <input id="preferred-name" type="text" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} className={inputCls} maxLength={50} />
        </div>

        <div>
          <label htmlFor="course" className="block text-[0.75rem] text-text-muted mb-1.5">
            {props.role === "alum" ? "Course studied" : "Course you're studying"}
          </label>
          <input
            id="course" type="text" value={course} onChange={(e) => setCourse(e.target.value)}
            className={inputCls} maxLength={200}
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
            {props.role === "student" && <span className="text-text-muted/70 ml-1">— optional</span>}
          </label>
          <input id="linkedin" type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className={inputCls} maxLength={512} required={props.role !== "student"} />
        </div>

        <div>
          <label htmlFor="github" className="block text-[0.75rem] text-text-muted mb-1.5">
            GitHub URL <span className="text-text-muted/70 ml-1">— optional</span>
          </label>
          <input id="github" type="url" placeholder="https://github.com/your-handle" value={github} onChange={(e) => setGithub(e.target.value)} className={inputCls} maxLength={512} />
        </div>

        <div>
          <label htmlFor="portfolio" className="block text-[0.75rem] text-text-muted mb-1.5">
            Portfolio URL <span className="text-text-muted/70 ml-1">— optional</span>
          </label>
          <input id="portfolio" type="url" placeholder="https://yourportfolio.com" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} className={inputCls} maxLength={512} />
        </div>

        <div>
          <label htmlFor="bio-focus" className="block text-[0.75rem] text-text-muted mb-1.5">
            What are you working on, or into? <span className="text-text-muted/70 ml-2">{bioFocus.length}/500</span>
          </label>
          <textarea id="bio-focus" rows={3} value={bioFocus} onChange={(e) => setBioFocus(e.target.value)} className={`${inputCls} resize-none`} maxLength={500} />
        </div>

        <div>
          <label htmlFor="bio-hobbies" className="block text-[0.75rem] text-text-muted mb-1.5">
            And outside of that? <span className="text-text-muted/70 ml-2">{bioHobbies.length}/500</span>
          </label>
          <textarea id="bio-hobbies" rows={2} value={bioHobbies} onChange={(e) => setBioHobbies(e.target.value)} className={`${inputCls} resize-none`} maxLength={500} />
        </div>

        <h2 className="pt-4 text-[1rem] font-medium text-text-primary">Skills</h2>
        <SkillPicker
          taxonomy={props.skillTaxonomy}
          selectedIds={skillIds}
          coreIds={coreSkillIds}
          suggested={suggestedSkills}
          onAdd={(id) => setSkillIds((prev) => [...prev, id])}
          onRemove={(id) => {
            setSkillIds((prev) => prev.filter((x) => x !== id));
            setCoreSkillIds((prev) => prev.filter((x) => x !== id));
          }}
          onToggleCore={toggleCoreSkill}
          maxCore={MAX_CORE_SKILLS}
        />

        <h2 className="pt-4 text-[1rem] font-medium text-text-primary">Interests</h2>
        <ChipGroup label="Sectors" items={props.sectors} selected={sectorIds} onToggle={toggleSector} />
        <Field label="Things you find genuinely interesting" hint="Not necessarily your job.">
          <TagInput
            placeholder="Add an interest…"
            suggestions={["Computer vision", "Medical devices", "Climate", "Robotics", "Fintech", "Policy", "Semiconductors", "Synthetic biology", "Space", "Developer tools"]}
            values={academicInterests}
            max={12}
            onAdd={(v) => setAcademicInterests((prev) => [...prev, v])}
            onRemove={(v) => setAcademicInterests((prev) => prev.filter((x) => x !== v))}
          />
        </Field>
        <Field label="Hobbies">
          <TagInput
            placeholder="Add a hobby…"
            suggestions={["Running", "Climbing", "Chess", "Cooking", "Football", "Photography", "Cycling", "Reading"]}
            values={hobbies}
            max={12}
            onAdd={(v) => setHobbies((prev) => [...prev, v])}
            onRemove={(v) => setHobbies((prev) => prev.filter((x) => x !== v))}
          />
        </Field>

        <h2 className="pt-4 text-[1rem] font-medium text-text-primary">Where you&apos;re at</h2>
        <Field label="What's your situation right now?">
          <ChoiceCards name="Current focus" columns={2} options={CURRENT_FOCUS} value={currentFocus || null} onChange={setCurrentFocus} />
        </Field>
        <Field label="Where's your venture at?">
          <ChoiceCards name="Venture stage" columns={2} options={VENTURE_STAGES} value={ventureStage || null} onChange={setVentureStage} />
        </Field>
        {showVentureDetail && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-[0.75rem] text-text-muted mb-1.5">Venture name</label>
                <input type="text" maxLength={200} value={ventureName} onChange={(e) => setVentureName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[0.75rem] text-text-muted mb-1.5">Website</label>
                <input type="url" maxLength={512} value={ventureUrl} onChange={(e) => setVentureUrl(e.target.value)} className={inputCls} placeholder="https://…" />
              </div>
            </div>
            <div>
              <label className="block text-[0.75rem] text-text-muted mb-1.5">One line on what it does</label>
              <input type="text" maxLength={140} value={ventureOneLiner} onChange={(e) => setVentureOneLiner(e.target.value)} className={inputCls} />
            </div>
            <Field label="Recruiting?">
              <PillChoice name="Recruiting" options={RECRUITING_STATUSES} value={recruitingStatus} onChange={setRecruitingStatus} />
            </Field>
          </>
        )}

        <h2 className="pt-4 text-[1rem] font-medium text-text-primary">What you want</h2>
        <Field label={`Pick up to ${MAX_INTENTS}, in order`}>
          <RankPicker options={INTENTS} values={intents} onToggle={toggleIntent} max={MAX_INTENTS} />
        </Field>
        <Field label="How urgent?">
          <PillChoice name="Urgency" options={INTENT_URGENCIES} value={intentUrgency} onChange={setIntentUrgency} />
        </Field>
        <Field label="Hours a week for something new">
          <PillChoice name="Hours a week" options={AVAILABILITY_HOURS} value={availabilityHours} onChange={setAvailabilityHours} />
        </Field>

        <Button type="submit" loading={isLoading} variant="primary" size="lg" className="w-full mt-3">
          Save changes
        </Button>
      </form>
    </div>
  );
}

// ─── Photo ─────────────────────────────────────────────────────────

function PhotoSection({ avatarUrl }: { avatarUrl: string | null }) {
  const router = useRouter();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const replaceRef = useRef<HTMLInputElement>(null);

  const upload = async (blob: Blob) => {
    setError("");
    setUploading(true);
    try {
      const ticket = await requestAvatarTicket();
      if (!ticket.ok) { setError(ticket.error); return; }

      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res = await fetch(ticket.data.uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket.data.token}` },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(detail?.detail ?? "That photo couldn't be uploaded.");
        return;
      }
      const stored = await res.json();
      const confirmed = await confirmAvatarUpload(stored.key);
      if (!confirmed.ok) { setError(confirmed.error); return; }

      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(blob));
      setPendingFile(null);
      router.refresh();
    } catch {
      setError("Couldn't reach the photo service. Try again in a moment.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setError("");
    const result = await removeAvatar();
    if (!result.ok) { setError(result.error); return; }
    setPreview(null);
    router.refresh();
  };

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-6 sm:p-8">
      <h2 className="mb-1 text-[1rem] font-medium text-text-primary">Photo</h2>
      <p className="mb-5 text-[0.825rem] leading-[1.6] text-text-muted">
        What people see first in the directory.
      </p>
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {pendingFile ? (
        <AvatarCropper file={pendingFile} onCropped={upload} onCancel={() => setPendingFile(null)} />
      ) : preview ? (
        <div className="flex items-center gap-4 rounded-lg border border-border-strong bg-white/[0.04] p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed blob URL or local object URL, not a static asset */}
          <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          <span className="flex-1 text-[0.85rem] text-text-primary">{uploading ? "Uploading…" : "Current photo"}</span>
          <button
            type="button"
            onClick={() => replaceRef.current?.click()}
            className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.04] px-3 py-2 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={remove}
            className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.04] px-3 py-2 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-[#ff4d4d]/60 hover:text-[#ff8080]"
          >
            Remove
          </button>
          <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Replace photo" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); e.target.value = ""; }} />
        </div>
      ) : (
        <FilePicker accept="image/jpeg,image/png,image/webp" label="Add a photo" hint="JPG, PNG or WebP" file={null} onPick={setPendingFile} onClear={() => {}} />
      )}
    </section>
  );
}

// ─── CV ────────────────────────────────────────────────────────────

/**
 * A few short retries for confirmCvUpload's background extraction to
 * finish, rather than the multi-screen gap the intake flow gets for
 * free — this page has no equivalent "a few steps later" moment.
 * Gives up silently after ~3.6s; the suggestions just won't show for
 * this visit, same as any other best-effort background result.
 */
async function pollForSuggestions(onSuggested: (ids: number[]) => void): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const result = await getMySuggestedCvSkillIds();
    if (result.ok && result.data.length > 0) {
      onSuggested(result.data);
      return;
    }
  }
}

function CvSection({
  originalFilename, uploadedAt, hasCv, onSuggested,
}: {
  originalFilename: string | null;
  uploadedAt: string | null;
  hasCv: boolean;
  onSuggested: (ids: number[]) => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [present, setPresent] = useState(hasCv);
  const [filename, setFilename] = useState(originalFilename);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const ticket = await requestCvTicket();
      if (!ticket.ok) { setError(ticket.error); return; }

      const form = new FormData();
      form.append("file", file);
      const res = await fetch(ticket.data.uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket.data.token}` },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setError(detail?.detail ?? "That file couldn't be uploaded. Try a PDF or DOCX.");
        return;
      }
      const stored = await res.json();
      const confirmed = await confirmCvUpload(stored.key, file.name, consent);
      if (!confirmed.ok) { setError(confirmed.error); return; }

      setPresent(true);
      setFilename(file.name);
      setFile(null);
      router.refresh();

      // Extraction runs in the background (mediaActions.confirmCvUpload's
      // after() callback) rather than blocking this upload — poll a few
      // times for it to land instead of making the member wait on it.
      // Not awaited: the upload itself is already done.
      if (consent) void pollForSuggestions(onSuggested);
    } catch {
      setError("Couldn't reach the file service. Try again in a moment.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setError("");
    const result = await removeCv();
    if (!result.ok) { setError(result.error); return; }
    setPresent(false);
    setFilename(null);
    router.refresh();
  };

  const download = async () => {
    setError("");
    const result = await getMyCvDownloadUrl();
    if (!result.ok) { setError(result.error); return; }
    if (result.data) window.open(result.data, "_blank", "noopener");
  };

  return (
    <section className="rounded-2xl border border-border bg-bg-card p-6 sm:p-8">
      <h2 className="mb-1 text-[1rem] font-medium text-text-primary">CV</h2>
      <p className="mb-5 text-[0.825rem] leading-[1.6] text-text-muted">
        Kept for you and, if you allow it once on upload, read to suggest
        skills. Only you and admins handling account reviews can open it.
      </p>
      {error && <div className="mb-4"><ErrorBanner>{error}</ErrorBanner></div>}

      {present && !file ? (
        <div className="flex items-center gap-4 rounded-lg border border-border-strong bg-white/[0.04] p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.03] font-mono text-[0.65rem] text-text-secondary">
            CV
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.85rem] text-text-primary">{filename ?? "Your CV"}</span>
            {uploadedAt && (
              <span className="block text-[0.75rem] text-text-muted">
                Uploaded {new Date(uploadedAt).toLocaleDateString()}
              </span>
            )}
          </span>
          <button type="button" onClick={download} className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.04] px-3 py-2 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary">
            Download
          </button>
          <button type="button" onClick={remove} className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.04] px-3 py-2 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-[#ff4d4d]/60 hover:text-[#ff8080]">
            Remove
          </button>
        </div>
      ) : (
        <>
          <FilePicker
            accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            label="Drop a PDF or DOCX"
            hint="or click to browse · 8 MB maximum"
            file={file}
            onPick={setFile}
            onClear={() => setFile(null)}
          />
          {file && (
            <>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border-strong bg-white/[0.03] p-4">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
                />
                <span className="text-[0.8rem] leading-[1.6] text-text-secondary">
                  Read the skills section of my CV once, to suggest skills to
                  add above. The text itself is never stored.
                </span>
              </label>
              <Button type="button" onClick={upload} loading={uploading} variant="primary" size="md" className="mt-3">
                Upload CV
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}

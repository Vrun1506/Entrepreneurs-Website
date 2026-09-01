"use client";

import { useId, useRef, useState } from "react";
import { inputCls } from "@/components/forms/styles";
import { ChipGroup, type ChipItem } from "@/components/forms/ChipGroup";
import { AvatarCropper } from "@/components/media/AvatarCropper";
import {
  MAX_CORE_SKILLS,
  MAX_INTENTS,
  MIN_SKILLS,
  CURRENT_FOCUS,
  VENTURE_STAGES,
  VENTURE_STAGES_WITH_DETAIL,
  RECRUITING_STATUSES,
  INTENTS,
  INTENT_URGENCIES,
  AVAILABILITY_HOURS,
  addressAs,
  type IntakeState,
} from "@/lib/intake/state";
import { Field, ChoiceCards, PillChoice, TagInput, FilePicker, RankPicker, SkillPicker, type SkillOption } from "./controls";

export type Patch = (p: Partial<IntakeState>) => void;

export type ScreenProps = {
  s: IntakeState;
  patch: Patch;
  firstName: string;
  skillTaxonomy: SkillOption[];
  sectors: ChipItem[];
  avatarUploading: boolean;
  avatarError: string;
  onCropAvatar: (blob: Blob) => Promise<void>;
};

/** Shared lead paragraph under a screen heading. */
function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mb-7 text-[0.95rem] leading-[1.65] text-text-secondary">{children}</p>;
}

/** A short aside that explains why a field is being asked for. */
function Aside({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-signal/40 pl-4">
      <p className="mb-1 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-signal">
        {title}
      </p>
      <p className="text-[0.825rem] leading-[1.65] text-text-secondary">{children}</p>
    </div>
  );
}

// ─── 01 · Face & bio ─────────────────────────────────────────────────

export function FaceScreen({ s, patch, firstName, avatarUploading, avatarError, onCropAvatar }: ScreenProps) {
  const nameId = useId();
  const focusId = useId();
  const hobbiesId = useId();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-7">
      <Lead>
        A face and a couple of lines — genuinely optional, but a directory of
        grey circles doesn&apos;t get anyone a reply. Skip anything here and
        come back later from My Profile.
      </Lead>

      <Field label="What should we call you?" htmlFor={nameId}>
        <input
          id={nameId}
          type="text"
          value={s.preferredName}
          onChange={(e) => patch({ preferredName: e.target.value })}
          maxLength={50}
          placeholder={firstName}
          className={inputCls}
        />
      </Field>

      <Field label="Your photo" hint="Optional. You'll be able to pick exactly which part of it shows.">
        {pendingFile ? (
          <AvatarCropper
            file={pendingFile}
            onCropped={async (blob) => {
              await onCropAvatar(blob);
              setPendingFile(null);
            }}
            onCancel={() => setPendingFile(null)}
          />
        ) : s.photoPreview ? (
          <div className="flex items-center gap-4 rounded-lg border border-border-strong bg-white/[0.04] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not a remote asset */}
            <img src={s.photoPreview} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
            <span className="min-w-0 flex-1 text-[0.85rem] text-text-primary">Looking good.</span>
            <button
              type="button"
              onClick={() => replaceRef.current?.click()}
              className="shrink-0 cursor-pointer rounded-lg border border-border-strong bg-white/[0.04] px-3 py-2 text-[0.775rem] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
            >
              Replace
            </button>
            <input
              ref={replaceRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPendingFile(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <FilePicker
            accept="image/jpeg,image/png,image/webp"
            label="Add a photo"
            hint="JPG, PNG or WebP"
            file={null}
            onPick={setPendingFile}
            onClear={() => {}}
          />
        )}
        {avatarUploading && <p className="mt-2 text-[0.775rem] text-text-muted">Uploading…</p>}
        {avatarError && <p className="mt-2 text-[0.775rem] text-[#ff8080]">{avatarError}</p>}
      </Field>

      <Field
        label="What are you working on, or into?"
        htmlFor={focusId}
        hint="A project, a research direction, a thing you won't shut up about. Two sentences is plenty."
      >
        <textarea
          id={focusId}
          rows={3}
          maxLength={500}
          value={s.bioFocus}
          onChange={(e) => patch({ bioFocus: e.target.value })}
          placeholder="Building a computer-vision tool for surgical training. Interested in medical devices, regulation, and anything that gets research out of the lab."
          className={`${inputCls} resize-y`}
        />
      </Field>

      <Field
        label="And outside of that?"
        htmlFor={hobbiesId}
        hint="Hobbies, in your own words. This is the half of a profile that actually gets people to a coffee."
      >
        <textarea
          id={hobbiesId}
          rows={2}
          maxLength={500}
          value={s.bioHobbies}
          onChange={(e) => patch({ bioHobbies: e.target.value })}
          placeholder="Long-distance running, cooking for too many people, and losing at chess."
          className={`${inputCls} resize-y`}
        />
      </Field>

      <Aside title="Two boxes, two jobs">
        The first drives professional matching. The second decides whether anyone
        actually meets. Keeping them apart means we can weight them differently
        instead of parsing one blob of prose.
      </Aside>
    </div>
  );
}

// ─── · You're in ─────────────────────────────────────────────────────

export type Match = {
  id: string;
  name: string;
  line: string;
  because: string;
};

export function YoureInScreen({ s, firstName, matches }: ScreenProps & { matches: Match[] }) {
  const name = addressAs(s.preferredName, firstName);
  return (
    <div className="text-center">
      <span
        aria-hidden
        className="mx-auto mb-6 block h-3 w-3 rotate-45 rounded-[1px] bg-signal"
      />
      <p className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-signal">
        Welcome
      </p>
      <h2 className="mb-4 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1] tracking-tight text-text-primary">
        Good to have you, {name}.
      </h2>
      <p className="mx-auto mb-9 max-w-[46ch] text-[0.95rem] leading-[1.65] text-text-secondary">
        A few more optional questions, and you&apos;re genuinely findable —
        not just a name in a list.
      </p>

      {matches.length > 0 ? (
        <ul className="grid gap-3 text-left sm:grid-cols-3">
          {matches.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-border bg-white/[0.03] p-4"
            >
              <span className="mb-3 block h-9 w-9 rounded-full border border-border-strong bg-white/[0.06]" />
              <span className="block text-[0.875rem] font-medium text-text-primary">{m.name}</span>
              <span className="mt-0.5 block text-[0.775rem] leading-[1.5] text-text-muted">
                {m.line}
              </span>
              <span className="mt-3 block border-t border-border-subtle pt-3 text-[0.775rem] leading-[1.5] text-text-secondary">
                {m.because}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-border bg-white/[0.03] p-6 text-left">
          <p className="text-[0.875rem] leading-[1.65] text-text-secondary">
            No one to show yet — you are early, and the directory is still
            filling up. Adding your skills and interests on the next screens
            is what makes you findable when the next person joins.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 02 · CV ─────────────────────────────────────────────────────────

export function CvScreen({ s, patch }: ScreenProps) {
  const linkedinId = useId();
  const consentId = useId();
  return (
    <div className="space-y-7">
      <Lead>Entirely optional, and it costs you nothing you haven&apos;t already got.</Lead>

      <Field label="Your CV" hint="PDF or DOCX · 8 MB maximum.">
        <FilePicker
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          label="Drop a PDF or DOCX"
          hint="or click to browse · 8 MB maximum"
          file={s.cvFile}
          onPick={(f) => patch({ cvFile: f, cvUploadedKey: null })}
          onClear={() => patch({ cvFile: null, cvUploadedKey: null })}
        />
      </Field>

      {s.cvFile && (
        <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-strong bg-white/[0.03] p-4">
          <input
            id={consentId}
            type="checkbox"
            checked={s.cvConsent}
            onChange={(e) => patch({ cvConsent: e.target.checked })}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
          />
          <span className="text-[0.8rem] leading-[1.6] text-text-secondary">
            Read the skills section of my CV once, to suggest skills to add on
            the next screen. We never add anything without you confirming it,
            and the text itself is never stored — only the matched skills. You
            can leave this unticked and add skills yourself instead.
          </span>
        </label>
      )}

      <Field label="Or just a link" htmlFor={linkedinId} hint="A LinkedIn profile does most of the same work.">
        <input
          id={linkedinId}
          type="url"
          value={s.linkedin}
          onChange={(e) => patch({ linkedin: e.target.value })}
          placeholder="https://linkedin.com/in/…"
          className={inputCls}
        />
      </Field>
    </div>
  );
}

// ─── 03 · Skills ─────────────────────────────────────────────────────

export function SkillsScreen({ s, patch, skillTaxonomy }: ScreenProps) {
  const suggested = s.suggestedSkillIds
    .filter((id) => !s.skillIds.includes(id))
    .map((id) => skillTaxonomy.find((t) => t.id === id))
    .filter((t): t is SkillOption => !!t);

  const add = (id: number) => patch({ skillIds: [...s.skillIds, id] });
  const remove = (id: number) =>
    patch({ skillIds: s.skillIds.filter((x) => x !== id), coreSkillIds: s.coreSkillIds.filter((x) => x !== id) });
  const toggleCore = (id: number) =>
    patch({
      coreSkillIds: s.coreSkillIds.includes(id)
        ? s.coreSkillIds.filter((x) => x !== id)
        : s.coreSkillIds.length < MAX_CORE_SKILLS
          ? [...s.coreSkillIds, id]
          : s.coreSkillIds,
    });

  return (
    <div className="space-y-7">
      <Lead>
        Picked from a curated list, not typed freehand — that&apos;s what
        keeps &quot;ML&quot;, &quot;machine learning&quot; and &quot;AI&quot;
        from being three different things in search.
      </Lead>

      <Field
        label="Your skills"
        hint={`At least ${MIN_SKILLS} to continue from this screen — or skip the whole thing for now and come back later. Star up to ${MAX_CORE_SKILLS} as core.`}
      >
        <SkillPicker
          taxonomy={skillTaxonomy}
          selectedIds={s.skillIds}
          coreIds={s.coreSkillIds}
          suggested={suggested}
          onAdd={add}
          onRemove={remove}
          onToggleCore={toggleCore}
          maxCore={MAX_CORE_SKILLS}
        />
      </Field>
    </div>
  );
}

// ─── 04 · Interests ──────────────────────────────────────────────────

export function InterestsScreen({ s, patch, sectors }: ScreenProps) {
  const toggleSector = (id: number) =>
    patch({
      sectorIds: s.sectorIds.includes(id)
        ? s.sectorIds.filter((x) => x !== id)
        : [...s.sectorIds, id],
    });

  return (
    <div className="space-y-7">
      <Lead>Three fields, and the third one is the one that gets you invited to things.</Lead>

      <ChipGroup
        label="Sectors you'd build in"
        items={sectors}
        selected={new Set(s.sectorIds)}
        onToggle={toggleSector}
      />

      <Field
        label="Things you find genuinely interesting"
        hint="Not necessarily your job. Anything you'd read about on a Sunday."
      >
        <TagInput
          placeholder="Add an interest…"
          suggestions={[
            "Computer vision", "Medical devices", "Climate", "Robotics", "Fintech",
            "Policy", "Semiconductors", "Synthetic biology", "Space", "Developer tools",
          ]}
          values={s.academicInterests}
          max={12}
          onAdd={(v) => patch({ academicInterests: [...s.academicInterests, v] })}
          onRemove={(v) => patch({ academicInterests: s.academicInterests.filter((x) => x !== v) })}
        />
      </Field>

      <Field label="Hobbies" hint="The half of the profile that turns a match into a coffee.">
        <TagInput
          placeholder="Add a hobby…"
          suggestions={["Running", "Climbing", "Chess", "Cooking", "Football", "Photography", "Cycling", "Reading"]}
          values={s.hobbies}
          max={12}
          onAdd={(v) => patch({ hobbies: [...s.hobbies, v] })}
          onRemove={(v) => patch({ hobbies: s.hobbies.filter((x) => x !== v) })}
        />
      </Field>
    </div>
  );
}

// ─── 05 · Where you're at ────────────────────────────────────────────

export function WhereScreen({ s, patch }: ScreenProps) {
  const nameId = useId();
  const urlId = useId();
  const showDetail = VENTURE_STAGES_WITH_DETAIL.has(s.ventureStage);

  return (
    <div className="space-y-7">
      <Lead>This changes most often — update it whenever it stops being true.</Lead>

      <Field label="What's your situation right now?">
        <ChoiceCards
          name="Current focus"
          columns={2}
          options={CURRENT_FOCUS}
          value={s.currentFocus || null}
          onChange={(v) => patch({ currentFocus: v })}
        />
      </Field>

      <Field label="Where's your venture at?">
        <ChoiceCards
          name="Venture stage"
          columns={2}
          options={VENTURE_STAGES}
          value={s.ventureStage || null}
          onChange={(v) => patch({ ventureStage: v })}
        />
      </Field>

      {showDetail && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Venture name" htmlFor={nameId}>
              <input
                id={nameId}
                type="text"
                maxLength={200}
                value={s.ventureName}
                onChange={(e) => patch({ ventureName: e.target.value })}
                placeholder="Whatever you call it"
                className={inputCls}
              />
            </Field>
            <Field label="Website" htmlFor={urlId}>
              <input
                id={urlId}
                type="url"
                maxLength={512}
                value={s.ventureUrl}
                onChange={(e) => patch({ ventureUrl: e.target.value })}
                placeholder="https://…"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="One line on what it does">
            <input
              type="text"
              maxLength={140}
              value={s.ventureOneLiner}
              onChange={(e) => patch({ ventureOneLiner: e.target.value })}
              placeholder="Computer vision that scores surgical technique from theatre footage."
              className={inputCls}
            />
          </Field>

          <Field label="Recruiting?">
            <PillChoice
              name="Recruiting"
              options={RECRUITING_STATUSES}
              value={s.recruitingStatus}
              onChange={(v) => patch({ recruitingStatus: v })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

// ─── 06 · What you want ──────────────────────────────────────────────

export function WantScreen({ s, patch }: ScreenProps) {
  const toggle = (v: string) =>
    patch({
      intents: s.intents.includes(v)
        ? s.intents.filter((x) => x !== v)
        : s.intents.length < MAX_INTENTS
          ? [...s.intents, v]
          : s.intents,
    });

  return (
    <div className="space-y-7">
      <Lead>
        Pick up to {MAX_INTENTS}, in order. This is what the directory sorts
        on when someone goes looking for a person like you.
      </Lead>

      <Field label={`Pick up to ${MAX_INTENTS}, in order`}>
        <RankPicker options={INTENTS} values={s.intents} onToggle={toggle} max={MAX_INTENTS} />
      </Field>

      <Field label="How urgent?">
        <PillChoice
          name="Urgency"
          options={INTENT_URGENCIES}
          value={s.intentUrgency}
          onChange={(v) => patch({ intentUrgency: v })}
        />
      </Field>

      <Field label="Hours a week for something new">
        <PillChoice
          name="Hours a week"
          options={AVAILABILITY_HOURS}
          value={s.availabilityHours}
          onChange={(v) => patch({ availabilityHours: v })}
        />
      </Field>
    </div>
  );
}

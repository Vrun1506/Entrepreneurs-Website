"use client";

import { useId } from "react";
import { inputCls } from "@/components/forms/styles";
import { ChipGroup, type ChipItem } from "@/components/forms/ChipGroup";
import { gradYearOptions } from "@/lib/gradYears";
import {
  AFFILIATIONS,
  NO_GRAD_YEAR,
  HAS_GRADUATED,
  type Affiliation,
} from "@/lib/intake/steps";
import {
  MAX_CORE_SKILLS,
  MAX_WANTS,
  MIN_SKILLS,
  VENTURE_STAGES,
  URGENCIES,
  HOURS,
  WANTS,
  addressAs,
  type IntakeState,
} from "@/lib/intake/state";
import { Field, ChoiceCards, PillChoice, TagInput, FilePicker, RankPicker } from "./controls";

export type Patch = (p: Partial<IntakeState>) => void;

export type ScreenProps = {
  s: IntakeState;
  patch: Patch;
  skillSuggestions: string[];
  sectors: ChipItem[];
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

// ─── 01 · Identity ───────────────────────────────────────────────────

export function IdentityScreen({ s, patch }: ScreenProps) {
  const nameId = useId();
  const prefId = useId();
  const courseId = useId();
  const yearId = useId();

  const aff = s.affiliation;
  const showGradYear = aff !== null && !NO_GRAD_YEAR.includes(aff);
  const graduated = aff !== null && HAS_GRADUATED.includes(aff);

  return (
    <div className="space-y-7">
      <Lead>
        Membership is closed and every account is a checked Imperial affiliate. Six
        questions here, then you are through.
      </Lead>

      {/* Affiliation is chosen at signup, written into profiles.role by
          tg_handle_new_user, and locked by a trigger from that point on —
          submit_onboarding takes no role argument, so a picker here would
          take a change and silently drop it. Shown as a confirmation
          instead. Making it editable needs a role parameter on the RPC
          plus a re-run of the Imperial-domain check for 'student'. */}
      {aff ? (
        <Field
          label="How you're connected to Imperial"
          hint="Chosen when you signed up. Contact us if it's wrong — it decides whether an admin reviews your account, so it isn't self-service."
        >
          <div className="flex items-center gap-3 rounded-lg border border-border-strong bg-white/[0.06] px-4 py-3">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
            <span className="min-w-0">
              <span className="block text-[0.85rem] font-medium text-text-primary">
                {AFFILIATIONS.find((a) => a.value === aff)?.label}
              </span>
              <span className="mt-0.5 block text-[0.775rem] leading-[1.5] text-text-muted">
                {AFFILIATIONS.find((a) => a.value === aff)?.blurb}
              </span>
            </span>
          </div>
        </Field>
      ) : (
        <Field
          label="How are you connected to Imperial?"
          hint="This decides what the directory shows about you, and whether an admin needs to check your account."
        >
          <ChoiceCards<Affiliation>
            name="Affiliation"
            options={AFFILIATIONS}
            value={aff}
            onChange={(v) =>
              patch({ affiliation: v, gradYear: NO_GRAD_YEAR.includes(v) ? "" : s.gradYear })
            }
          />
        </Field>
      )}

      <Field label="Email" hint="Verified at sign-in. Change it from settings, not here.">
        <input
          type="email"
          value={s.email}
          readOnly
          aria-readonly
          className={`${inputCls} cursor-not-allowed text-text-secondary`}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor={nameId}>
          <input
            id={nameId}
            type="text"
            value={s.fullName}
            onChange={(e) => patch({ fullName: e.target.value })}
            placeholder="Full name"
            className={inputCls}
          />
        </Field>
        <Field label="What people call you" htmlFor={prefId}>
          <input
            id={prefId}
            type="text"
            value={s.preferredName}
            onChange={(e) => patch({ preferredName: e.target.value })}
            placeholder="Preferred name"
            className={inputCls}
          />
        </Field>
      </div>

      <Field
        label="Course"
        htmlFor={courseId}
        hint="Whatever you'd tell someone at a party — we don't need the catalogue code."
      >
        <input
          id={courseId}
          type="text"
          value={s.course}
          onChange={(e) => patch({ course: e.target.value })}
          placeholder="MEng Computing"
          className={inputCls}
        />
      </Field>

      {showGradYear && (
        <Field
          label={graduated ? "Graduation year" : "Expected graduation year"}
          htmlFor={yearId}
        >
          <select
            id={yearId}
            value={s.gradYear}
            onChange={(e) => patch({ gradYear: e.target.value })}
            className={inputCls}
          >
            <option value="">Select a year</option>
            {gradYearOptions(graduated ? "alum" : "student").map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

// ─── 02 · Face & bio ─────────────────────────────────────────────────

export function FaceScreen({ s, patch }: ScreenProps) {
  const focusId = useId();
  const hobbiesId = useId();
  const name = addressAs(s);

  return (
    <div className="space-y-7">
      <Lead>
        Nearly there, {name}. Two boxes and a photo, and the gate is behind you.
        {s.course.trim() && (
          <>
            {" "}
            We&apos;ll show <span className="text-text-primary">{s.course.trim()}</span> on your
            card so people know where you came from.
          </>
        )}
      </Lead>

      <Field
        label="Your photo"
        hint="Required, not optional. A directory of grey circles doesn't get anyone a reply."
      >
        <FilePicker
          accept="image/jpeg,image/png,image/webp"
          label="Add a photo"
          hint="JPG, PNG or WebP · this is what everyone sees first"
          file={s.photo}
          preview={s.photoPreview}
          onPick={(f) => {
            if (s.photoPreview) URL.revokeObjectURL(s.photoPreview);
            patch({ photo: f, photoPreview: URL.createObjectURL(f) });
          }}
          onClear={() => {
            if (s.photoPreview) URL.revokeObjectURL(s.photoPreview);
            patch({ photo: null, photoPreview: null });
          }}
        />
      </Field>

      <Field
        label="What are you working on, or into?"
        htmlFor={focusId}
        hint="A project, a research direction, a thing you won't shut up about. Two sentences is plenty."
      >
        <textarea
          id={focusId}
          rows={3}
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

export function YoureInScreen({ s, matches }: ScreenProps & { matches: Match[] }) {
  const name = addressAs(s);
  return (
    <div className="text-center">
      <span
        aria-hidden
        className="mx-auto mb-6 block h-3 w-3 rotate-45 rounded-[1px] bg-signal"
      />
      <p className="mb-2 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-signal">
        Gate complete · 40%
      </p>
      <h2 className="mb-4 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1] tracking-tight text-text-primary">
        You&apos;re in, {name}.
      </h2>
      <p className="mx-auto mb-9 max-w-[46ch] text-[0.95rem] leading-[1.65] text-text-secondary">
        Nine fields, about a minute. Here is what that already bought you.
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
            No matches to show yet — you are early, and the directory is still filling
            up. Adding your skills and interests on the next three screens is what
            makes you findable when the next person joins.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 03 · CV ─────────────────────────────────────────────────────────

export function CvScreen({ s, patch }: ScreenProps) {
  const linkedinId = useId();
  return (
    <div className="space-y-7">
      <Lead>
        First thing inside, and entirely optional. You are already through the door,
        so none of this costs you a signup.
      </Lead>

      <Field
        label="Your CV"
        hint="Stored for you and for admins reviewing accounts. Nothing is read from it automatically yet, so it won't fill in the screens ahead."
      >
        <FilePicker
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          label="Drop a PDF or DOCX"
          hint="or click to browse · 4 MB maximum"
          file={s.cvFile}
          onPick={(f) => patch({ cvFile: f })}
          onClear={() => patch({ cvFile: null })}
        />
      </Field>

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

// ─── 04 · Skills ─────────────────────────────────────────────────────

export function SkillsScreen({ s, patch, skillSuggestions }: ScreenProps) {
  const coreCount = s.skills.filter((k) => k.core).length;
  const names = s.skills.map((k) => k.name);

  const add = (name: string) =>
    patch({
      skills: [...s.skills, { name, core: false, known: skillSuggestions.includes(name) }],
    });
  const remove = (name: string) => patch({ skills: s.skills.filter((k) => k.name !== name) });
  const toggleCore = (name: string) =>
    patch({
      skills: s.skills.map((k) =>
        k.name === name
          ? { ...k, core: !k.core && coreCount >= MAX_CORE_SKILLS ? k.core : !k.core }
          : k,
      ),
    });

  return (
    <div className="space-y-7">
      <Lead>
        Type anything. The suggestions are a shortcut, not a list you have to pick
        from — if we have never heard of it, it still counts.
      </Lead>

      <Field
        label="Your skills"
        hint={`At least ${MIN_SKILLS}. Star up to ${MAX_CORE_SKILLS} as core; the rest read as familiar.`}
      >
        <TagInput
          placeholder="Start typing a skill…"
          suggestions={skillSuggestions}
          values={names}
          onAdd={add}
          onRemove={remove}
        />
      </Field>

      {s.skills.length > 0 && (
        <Field
          label={`Core skills — ${coreCount} of ${MAX_CORE_SKILLS}`}
          hint="The two or three you'd actually want to be found for."
        >
          <div className="flex flex-wrap gap-2">
            {s.skills.map((k) => {
              const locked = !k.core && coreCount >= MAX_CORE_SKILLS;
              return (
                <button
                  key={k.name}
                  type="button"
                  disabled={locked}
                  aria-pressed={k.core}
                  onClick={() => toggleCore(k.name)}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[0.775rem] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                    k.core
                      ? "border-signal/50 bg-signal-muted text-text-primary"
                      : "border-border-strong bg-white/[0.03] text-text-secondary hover:border-accent hover:text-text-primary"
                  }`}
                >
                  <span aria-hidden className={k.core ? "text-signal" : "text-text-muted"}>
                    ★
                  </span>
                  {k.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}
    </div>
  );
}

// ─── 05 · Interests ──────────────────────────────────────────────────

export function InterestsScreen({ s, patch, sectors }: ScreenProps) {
  const toggleSector = (id: number) =>
    patch({
      sectorIds: s.sectorIds.includes(id)
        ? s.sectorIds.filter((x) => x !== id)
        : [...s.sectorIds, id],
    });

  return (
    <div className="space-y-7">
      <Lead>
        Three fields, and the third one is the one that gets you invited to things.
      </Lead>

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
            "Computer vision",
            "Medical devices",
            "Climate",
            "Robotics",
            "Fintech",
            "Policy",
            "Semiconductors",
            "Synthetic biology",
            "Space",
            "Developer tools",
          ]}
          values={s.interests}
          onAdd={(v) => patch({ interests: [...s.interests, v] })}
          onRemove={(v) => patch({ interests: s.interests.filter((x) => x !== v) })}
        />
      </Field>

      <Field
        label="Hobbies"
        hint="The half of the profile that turns a match into a coffee."
      >
        <TagInput
          placeholder="Add a hobby…"
          suggestions={["Running", "Climbing", "Chess", "Cooking", "Football", "Photography", "Cycling", "Reading"]}
          values={s.hobbies}
          onAdd={(v) => patch({ hobbies: [...s.hobbies, v] })}
          onRemove={(v) => patch({ hobbies: s.hobbies.filter((x) => x !== v) })}
        />
      </Field>
    </div>
  );
}

// ─── 06 · Where you're at ────────────────────────────────────────────

export function WhereScreen({ s, patch }: ScreenProps) {
  const lineId = useId();
  return (
    <div className="space-y-7">
      <Lead>
        This one changes most often, so it is the one we&apos;ll ask you to confirm each
        term. Skip anything that doesn&apos;t apply.
      </Lead>

      <Field label="Where's your venture at?">
        <ChoiceCards
          name="Venture stage"
          columns={2}
          options={VENTURE_STAGES.map((v) => ({ value: v, label: v }))}
          value={s.ventureStage || null}
          onChange={(v) => patch({ ventureStage: v })}
        />
      </Field>

      {s.ventureStage && s.ventureStage !== "Not building anything right now" && (
        <>
          <Field label="One line on what it does" htmlFor={lineId}>
            <input
              id={lineId}
              type="text"
              value={s.ventureOneLine}
              onChange={(e) => patch({ ventureOneLine: e.target.value })}
              placeholder="Computer vision that scores surgical technique from theatre footage."
              className={inputCls}
            />
          </Field>

          <Field label="Recruiting?">
            <PillChoice
              name="Recruiting"
              options={["Not right now", "Co-founder", "First hires", "Interns"] as const}
              value={s.recruiting as "" | "Not right now"}
              onChange={(v) => patch({ recruiting: v })}
            />
          </Field>
        </>
      )}
    </div>
  );
}

// ─── 07 · What you want ──────────────────────────────────────────────

export function WantScreen({ s, patch }: ScreenProps) {
  const toggle = (v: string) =>
    patch({
      wants: s.wants.includes(v)
        ? s.wants.filter((x) => x !== v)
        : s.wants.length < MAX_WANTS
          ? [...s.wants, v]
          : s.wants,
    });

  return (
    <div className="space-y-7">
      <Lead>
        Pick up to {MAX_WANTS}, in order. This is what the directory sorts on when
        someone goes looking for a person like you.
      </Lead>

      <Field label={`Pick up to ${MAX_WANTS}, in order`}>
        <RankPicker options={WANTS} values={s.wants} onToggle={toggle} max={MAX_WANTS} />
      </Field>

      <Field label="How urgent?">
        <PillChoice
          name="Urgency"
          options={URGENCIES}
          value={s.urgency as "" | (typeof URGENCIES)[number]}
          onChange={(v) => patch({ urgency: v })}
        />
      </Field>

      <Field label="Hours a week for something new">
        <PillChoice
          name="Hours a week"
          options={HOURS}
          value={s.hoursPerWeek as "" | (typeof HOURS)[number]}
          onChange={(v) => patch({ hoursPerWeek: v })}
        />
      </Field>
    </div>
  );
}

// ─── 08 · Termly refresh ─────────────────────────────────────────────

export function RefreshScreen({ s, patch }: ScreenProps) {
  const name = addressAs(s);
  return (
    <div className="space-y-7">
      <Lead>
        Once a term, {name}, we&apos;ll show you this and ask one question. It takes a
        few seconds and it is the only thing keeping the directory from rotting.
      </Lead>

      <div className="rounded-lg border border-border bg-white/[0.03] p-5">
        <dl className="space-y-3 text-[0.85rem]">
          {[
            ["Course", s.course],
            ["Working on", s.bioFocus],
            ["Venture stage", s.ventureStage],
            ["Looking for", s.wants.join(", ")],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[9rem_1fr] gap-3">
              <dt className="text-[0.75rem] font-medium uppercase tracking-[0.14em] text-text-muted">
                {k}
              </dt>
              <dd className="text-text-secondary">
                {v?.toString().trim() || <span className="text-text-muted">— not set</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <Field label="Still accurate?">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={s.refreshConfirmed}
            onClick={() => patch({ refreshConfirmed: true })}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-[0.8rem] transition-colors duration-150 ${
              s.refreshConfirmed
                ? "border-accent bg-accent font-medium text-bg-primary"
                : "border-border-strong bg-white/[0.03] text-text-secondary hover:border-accent hover:text-text-primary"
            }`}
          >
            All still accurate
          </button>
          <button
            type="button"
            aria-pressed={!s.refreshConfirmed && s.refreshConfirmed !== null}
            onClick={() => patch({ refreshConfirmed: false })}
            className="cursor-pointer rounded-lg border border-border-strong bg-white/[0.03] px-4 py-2 text-[0.8rem] text-text-secondary transition-colors duration-150 hover:border-accent hover:text-text-primary"
          >
            Something&apos;s changed
          </button>
        </div>
      </Field>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/forms/Banners";
import type { ChipItem } from "@/components/forms/ChipGroup";
import {
  GROUPS,
  ORDER,
  STEPS,
  TOTAL_SCREENS,
  completeness,
  indexOf,
  NO_GRAD_YEAR,
  type Affiliation,
  type StepId,
} from "@/lib/intake/steps";
import { MIN_SKILLS, initialState, type IntakeState } from "@/lib/intake/state";
import StepRail from "./StepRail";
import {
  CvScreen,
  FaceScreen,
  IdentityScreen,
  InterestsScreen,
  RefreshScreen,
  SkillsScreen,
  WantScreen,
  WhereScreen,
  YoureInScreen,
  type Match,
  type ScreenProps,
} from "./screens";

// ════════════════════════════════════════════════════════════════════
// Foundry · Intake flow
//
// Nine screens in three groups. The old form was four undifferentiated
// steps in one card, which made every field look equally compulsory and
// put a file upload and a LinkedIn URL at the same weight as a name.
//
// Two structural choices carry the redesign:
//
//   * The gate is two screens and ends in a result. Everything after it is
//     explicitly optional, and the rail says so before you start.
//   * Screens address the member by the name they gave and quote answers
//     back at them. A flow that has clearly read your last answer is the
//     difference between being processed and being let in.
//
// LIVE-DATA NOTE: several fields here (preferred name, hobbies bio, photo,
// CV, core skills, screens 06-08) have no column in the schema yet. This
// component is mounted at /onboarding/preview only. It must not be wired to
// submit_onboarding until those columns exist, or it would show a success
// screen over answers that silently went nowhere.
// ════════════════════════════════════════════════════════════════════

const LINKEDIN_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i;

export default function IntakeFlow({
  email,
  firstName,
  surname,
  affiliation,
  skillSuggestions,
  sectors,
  matches,
}: {
  email: string;
  firstName: string;
  surname: string;
  affiliation: Affiliation | null;
  skillSuggestions: string[];
  sectors: ChipItem[];
  matches: Match[];
}) {
  const [s, setS] = useState<IntakeState>(() =>
    initialState({ email, firstName, surname, affiliation }),
  );
  const [step, setStep] = useState<StepId>("identity");
  const [furthest, setFurthest] = useState<StepId>("identity");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [error, setError] = useState("");

  const patch = (p: Partial<IntakeState>) => setS((prev) => ({ ...prev, ...p }));

  const idx = indexOf(step);
  const meta = STEPS[step];
  const isLast = idx === TOTAL_SCREENS - 1;

  // Object URLs outlive the component unless revoked.
  useEffect(() => {
    return () => {
      if (s.photoPreview) URL.revokeObjectURL(s.photoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  const validate = (id: StepId): string | null => {
    if (id === "identity") {
      if (!s.affiliation) return "Pick how you're connected to Imperial.";
      if (!s.fullName.trim()) return "Your full name is required.";
      if (s.fullName.trim().length > 100) return "Name must be 100 characters or fewer.";
      if (!s.course.trim()) return "Course is required.";
      if (s.course.trim().length > 200) return "Course must be 200 characters or fewer.";
      if (!NO_GRAD_YEAR.includes(s.affiliation) && !s.gradYear) {
        return "Pick a graduation year.";
      }
    }
    if (id === "face") {
      if (!s.photo) return "A photo is required to finish the gate.";
      if (!s.bioFocus.trim()) return "Tell us what you're working on, or into.";
      if (s.bioFocus.length > 500) return "Keep this to 500 characters or fewer.";
      if (s.bioHobbies.length > 500) return "Keep this to 500 characters or fewer.";
    }
    if (id === "cv") {
      const lk = s.linkedin.trim();
      if (lk && !LINKEDIN_RE.test(lk)) return "That doesn't look like a LinkedIn URL.";
    }
    if (id === "skills") {
      if (s.skills.length < MIN_SKILLS) {
        return `Add at least ${MIN_SKILLS} skills — you have ${s.skills.length}.`;
      }
    }
    return null;
  };

  const go = (to: StepId, direction: "fwd" | "back") => {
    setError("");
    setDir(direction);
    setStep(to);
    if (indexOf(to) > indexOf(furthest)) setFurthest(to);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  };

  const next = () => {
    const err = validate(step);
    if (err) return setError(err);
    if (!isLast) go(ORDER[idx + 1], "fwd");
  };

  const back = () => {
    if (idx > 0) go(ORDER[idx - 1], "back");
  };

  const pct = useMemo(() => completeness(step), [step]);

  const screenProps: ScreenProps = { s, patch, skillSuggestions, sectors };

  const body = (() => {
    switch (step) {
      case "identity":
        return <IdentityScreen {...screenProps} />;
      case "face":
        return <FaceScreen {...screenProps} />;
      case "youre-in":
        return <YoureInScreen {...screenProps} matches={matches} />;
      case "cv":
        return <CvScreen {...screenProps} />;
      case "skills":
        return <SkillsScreen {...screenProps} />;
      case "interests":
        return <InterestsScreen {...screenProps} />;
      case "where":
        return <WhereScreen {...screenProps} />;
      case "want":
        return <WantScreen {...screenProps} />;
      case "refresh":
        return <RefreshScreen {...screenProps} />;
    }
  })();

  const gateDone = idx >= indexOf("youre-in");

  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-primary/90 px-8 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <Link href="/" className="no-underline">
            <BrandLogo size="sm" />
          </Link>
          <span className="text-[0.8rem] text-text-muted">
            Signed in as <span className="text-text-secondary">{email}</span>
          </span>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-12"
      >
        <div className="grid gap-12 lg:grid-cols-[15rem_1fr]">
          <aside className="hidden lg:block">
            <StepRail current={step} furthest={furthest} onJump={(to) => go(to, "back")} />
          </aside>

          <div className="min-w-0">
            {/* Progress. Gold reads as status here, which is the one role the
                palette still reserves for it. */}
            <div className="mb-8 flex items-center gap-4">
              <div
                className="h-px flex-1 bg-border"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Profile completeness"
              >
                <div
                  className="h-px bg-signal transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[0.7rem] text-text-muted">
                {pct}% profile complete
              </span>
            </div>

            <div key={step} className={dir === "fwd" ? "anim-step-fwd" : "anim-step-back"}>
              <p className="mb-3 text-[0.75rem] font-medium uppercase tracking-[0.14em] text-text-muted">
                {meta.eyebrow}
              </p>
              {step !== "youre-in" && (
                <h1 className="mb-5 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1] tracking-tight text-text-primary">
                  {meta.title}
                </h1>
              )}

              {error && (
                <div className="mb-6">
                  <ErrorBanner>{error}</ErrorBanner>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-bg-card p-6 sm:p-8">{body}</div>
            </div>

            <div className="mt-8 flex items-center gap-3 border-t border-border-subtle pt-6">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={back}
                disabled={idx === 0}
                className={idx === 0 ? "invisible" : ""}
              >
                ← Back
              </Button>

              <span className="flex-1 text-center font-mono text-[0.7rem] text-text-muted">
                Screen {idx + 1} / {TOTAL_SCREENS}
              </span>

              {isLast ? (
                <Button type="button" variant="primary" size="md" disabled>
                  Done
                </Button>
              ) : (
                <Button type="button" variant="primary" size="md" onClick={next}>
                  {step === "face" ? "Finish the gate →" : gateDone ? "Continue →" : "Continue →"}
                </Button>
              )}
            </div>

            {/* Mobile rail — the desktop aside is hidden below lg, and losing
                the grouping entirely is what made the old form feel endless. */}
            <div className="mt-10 lg:hidden">
              <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-text-muted">
                {GROUPS.length} groups · {TOTAL_SCREENS} screens
              </p>
              <StepRail current={step} furthest={furthest} onJump={(to) => go(to, "back")} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

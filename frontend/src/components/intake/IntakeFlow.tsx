"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/forms/Banners";
import type { ChipItem } from "@/components/forms/ChipGroup";
import type { SkillOption } from "./controls";
import { createClient } from "@/lib/supabase/client";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import {
  requestAvatarTicket,
  confirmAvatarUpload,
  requestCvTicket,
  confirmCvUpload,
} from "@/app/profile/mediaActions";
import {
  GROUPS,
  ORDER,
  STEPS,
  TOTAL_SCREENS,
  completeness,
  indexOf,
  type StepId,
} from "@/lib/intake/steps";
import { MIN_SKILLS, initialState, type IntakeState } from "@/lib/intake/state";
import StepRail from "./StepRail";
import {
  CvScreen,
  FaceScreen,
  InterestsScreen,
  SkillsScreen,
  WantScreen,
  WhereScreen,
  YoureInScreen,
  type Match,
  type ScreenProps,
} from "./screens";

// ════════════════════════════════════════════════════════════════════
// Foundry · Post-approval intake
//
// Runs once, after admission — identity was already collected at
// /onboarding and fed the admin review queue before this ever mounts.
// Every screen is skippable via the button in the header, which calls
// defer_intake() and lands on /home; nothing here blocks getting into
// the product.
//
// Avatar and CV each own a real round trip to the upload gateway,
// centralised here rather than inside the screens: screens.tsx stays
// pure UI (patch state, nothing else), and every "bytes leave the
// browser" moment lives in one file. The avatar uploads the moment a
// crop is confirmed (screen 01); the CV uploads when the member
// continues past screen 02 — see uploadCv below for why that one waits.
// ════════════════════════════════════════════════════════════════════

export default function IntakeFlow({
  firstName,
  skillTaxonomy,
  sectors,
  matches,
}: {
  firstName: string;
  skillTaxonomy: SkillOption[];
  sectors: ChipItem[];
  matches: Match[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [s, setS] = useState<IntakeState>(() => initialState({ preferredName: firstName }));
  const [step, setStep] = useState<StepId>("face");
  const [furthest, setFurthest] = useState<StepId>("face");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const patch = (p: Partial<IntakeState>) => setS((prev) => ({ ...prev, ...p }));

  const idx = indexOf(step);
  const meta = STEPS[step];
  const isLast = idx === TOTAL_SCREENS - 1;

  useEffect(() => {
    return () => {
      if (s.photoPreview) URL.revokeObjectURL(s.photoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  const onCropAvatar = async (blob: Blob) => {
    setAvatarError("");
    setAvatarUploading(true);
    try {
      const ticket = await requestAvatarTicket();
      if (!ticket.ok) { setAvatarError(ticket.error); return; }

      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const res = await fetch(ticket.data.uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${ticket.data.token}` },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        setAvatarError(detail?.detail ?? "That photo couldn't be uploaded. Try a JPEG, PNG or WebP.");
        return;
      }
      const stored = await res.json();

      const confirmed = await confirmAvatarUpload(stored.key);
      if (!confirmed.ok) { setAvatarError(confirmed.error); return; }

      if (s.photoPreview) URL.revokeObjectURL(s.photoPreview);
      patch({ photoPreview: URL.createObjectURL(blob) });
    } catch {
      setAvatarError("Couldn't reach the photo service. Try again in a moment.");
    } finally {
      setAvatarUploading(false);
    }
  };

  /**
   * Uploads the CV chosen on screen 02, only when the member continues
   * past it (not on file pick) — picking a file the member then decides
   * not to keep should never cost a round trip. Runs at most once per
   * file: cvUploadedKey guards against re-uploading on Back → Continue.
   */
  const uploadCv = async (): Promise<string | null> => {
    if (!s.cvFile || s.cvUploadedKey) return null;

    const ticket = await requestCvTicket();
    if (!ticket.ok) return ticket.error;

    const form = new FormData();
    form.append("file", s.cvFile);
    const res = await fetch(ticket.data.uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${ticket.data.token}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      return detail?.detail ?? "That file couldn't be uploaded. Try a PDF or DOCX.";
    }
    const stored = await res.json();

    const confirmed = await confirmCvUpload(stored.key, s.cvFile.name, s.cvConsent);
    if (!confirmed.ok) return confirmed.error;

    patch({
      cvUploadedKey: stored.key,
      cvOriginalFilename: s.cvFile.name,
      suggestedSkillIds: confirmed.data.suggestedSkillIds,
    });
    return null;
  };

  const validate = (id: StepId): string | null => {
    if (id === "cv") {
      const lk = s.linkedin.trim();
      if (lk && !/^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(lk)) {
        return "That doesn't look like a LinkedIn URL.";
      }
    }
    if (id === "skills") {
      if (s.skillIds.length > 0 && s.skillIds.length < MIN_SKILLS) {
        return `Add at least ${MIN_SKILLS} skills, or skip this for now from the header.`;
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

  const finish = async () => {
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("submit_intake", {
      p_preferred_name: s.preferredName.trim() || null,
      p_bio_focus: s.bioFocus.trim() || null,
      p_bio_hobbies: s.bioHobbies.trim() || null,
      p_current_focus: s.currentFocus || null,
      p_venture_stage: s.ventureStage || null,
      p_venture_name: s.ventureName.trim() || null,
      p_venture_url: s.ventureUrl.trim() || null,
      p_venture_one_liner: s.ventureOneLiner.trim() || null,
      p_recruiting_status: s.recruitingStatus || null,
      p_intent_urgency: s.intentUrgency || null,
      p_availability_hours: s.availabilityHours || null,
      p_skill_ids: s.skillIds,
      p_core_skill_ids: s.coreSkillIds,
      p_sector_ids: s.sectorIds,
      p_academic_interests: s.academicInterests,
      p_hobbies: s.hobbies,
      p_intents: s.intents,
    });
    setBusy(false);
    if (rpcError) { setError(describeSupabaseError(rpcError)); return; }
    setDone(true);
  };

  const next = async () => {
    const validationError = validate(step);
    if (validationError) { setError(validationError); return; }

    if (step === "cv") {
      setBusy(true);
      const uploadError = await uploadCv();
      setBusy(false);
      if (uploadError) { setError(uploadError); return; }
    }

    if (isLast) {
      await finish();
    } else {
      go(ORDER[idx + 1], "fwd");
    }
  };

  const back = () => {
    if (idx > 0) go(ORDER[idx - 1], "back");
  };

  const skip = async () => {
    setBusy(true);
    await supabase.rpc("defer_intake");
    router.push("/home");
  };

  const pct = useMemo(() => completeness(step), [step]);

  const screenProps: ScreenProps = {
    s, patch, firstName, skillTaxonomy, sectors,
    avatarUploading, avatarError, onCropAvatar,
  };

  const body = (() => {
    switch (step) {
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
    }
  })();

  return (
    <div className="flex min-h-screen flex-col bg-bg-primary">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-primary/90 px-8 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <Link href="/" className="no-underline">
            <BrandLogo size="sm" />
          </Link>
          {!done && (
            <Button type="button" variant="ghost" size="sm" onClick={skip} disabled={busy}>
              Skip for now
            </Button>
          )}
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-12"
      >
        {done ? (
          <div className="mx-auto max-w-[46ch] text-center">
            <span aria-hidden className="mx-auto mb-6 block h-3 w-3 rotate-45 rounded-[1px] bg-signal" />
            <h1 className="mb-4 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1] tracking-tight text-text-primary">
              All set.
            </h1>
            <p className="mb-8 text-[0.95rem] leading-[1.65] text-text-secondary">
              You can change any of this any time from My Profile.
            </p>
            <Button type="button" variant="primary" size="md" onClick={() => router.push("/home")}>
              Go to your dashboard →
            </Button>
          </div>
        ) : (
          <div className="grid gap-12 lg:grid-cols-[15rem_1fr]">
            <aside className="hidden lg:block">
              <StepRail current={step} furthest={furthest} onJump={(to) => go(to, "back")} />
            </aside>

            <div className="min-w-0">
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
                  disabled={idx === 0 || busy}
                  className={idx === 0 ? "invisible" : ""}
                >
                  ← Back
                </Button>

                <span className="flex-1 text-center font-mono text-[0.7rem] text-text-muted">
                  Screen {idx + 1} / {TOTAL_SCREENS}
                </span>

                <Button type="button" variant="primary" size="md" onClick={next} loading={busy}>
                  {isLast ? "Finish →" : "Continue →"}
                </Button>
              </div>

              <div className="mt-10 lg:hidden">
                <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-text-muted">
                  {GROUPS.length} groups · {TOTAL_SCREENS} screens
                </p>
                <StepRail current={step} furthest={furthest} onJump={(to) => go(to, "back")} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

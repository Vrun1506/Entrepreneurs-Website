"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cleanName, isValidName } from "@/lib/text";
import { SignupDisclosures } from "@/components/forms/SignupDisclosures";
import { TurnstileWidget, turnstileConfigured } from "@/components/forms/TurnstileWidget";
import { BrandLogo } from "@/components/BrandLogo";

// Auth error text reaches us partly via ?error= in the URL, which is
// attacker-controllable — rendering it verbatim is a phishing/content-spoof
// vector. Map the cases users actually hit to fixed friendly copy and fall
// back to a generic line, so raw URL input is never shown as page content.
function friendlyAuthError(raw: string): string {
  const e = raw.toLowerCase();
  if (e.includes("not confirmed")) return "Please confirm your email first — check your inbox for the verification code.";
  if (e.includes("expired") || e.includes("invalid") || e.includes("missing_token") || e.includes("missing_code")) return "That link is invalid or has expired. Please request a new one.";
  if (e.includes("code verifier") || e.includes("both auth code")) return "Please open the link in the same browser you started in, or try signing in again.";
  if (e.includes("access_denied") || e.includes("cancel")) return "Sign-in was cancelled.";
  if (e.includes("rate") || e.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong during sign-in. Please try again.";
}

// Friendly copy for verifyOtp failures (wrong/expired code). Distinct from
// friendlyAuthError so we say "code" not "link".
function friendlyVerifyError(raw: string): string {
  const e = raw.toLowerCase();
  if (e.includes("expired")) return "That code has expired. Request a new one below.";
  if (e.includes("invalid") || e.includes("token")) return "That code is incorrect. Check it and try again.";
  if (e.includes("rate") || e.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  return "We couldn't verify that code. Please try again.";
}

/* ── Decorative background ────────────────────────────────────────── */
function BackgroundEffects() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] -right-[15%] w-[600px] h-[600px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 65%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[25%] -left-[10%] w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(201,168,76,0.03) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: "linear-gradient(rgba(201,168,76,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.3) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </>
  );
}

/* ── Logo ─────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <Link href="/" className="no-underline inline-block">
      <BrandLogo size="sm" />
    </Link>
  );
}

/* ── Google icon ──────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.547 0 9s.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
type Mode = "signin" | "signup";
type Role = "student" | "alum" | null;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signup");
  const [role, setRole] = useState<Role>(null);

  // Alum form fields
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [tcAgreed, setTcAgreed] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // On-screen OTP code entry (replaces the emailed magic link — Microsoft 365
  // Safe Links pre-fetches link URLs and burns the single-use token, so codes
  // are the only reliable path for our Imperial mail audience).
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Cloudflare Turnstile for the auth send-endpoints (sign-in / sign-up /
  // resend / password reset). Login talks to Supabase directly from the
  // browser, so we use Supabase's native captcha: pass options.captchaToken and
  // GoTrue verifies it server-side. A token is single-use, so after each send
  // we bump turnstileNonce, which remounts the widget (via its key) to issue a
  // fresh token for the next send/resend. Inert unless both the public site key
  // (widget) and the dashboard captcha setting are configured.
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const refreshTurnstile = () => {
    setTurnstileToken("");
    setTurnstileNonce((n) => n + 1);
  };

  // Tick the resend cooldown to 0 once per second when active.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // The /auth/callback route bounces failed OAuth attempts back here with
  // ?error=...; read it on mount (not during render — that would cause
  // a hydration mismatch since the server never sees window.location),
  // then strip it from the URL so a refresh doesn't re-show.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("error");
    if (!e) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(friendlyAuthError(e));
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Sign-in successful — route by admin status + profile state.
  // Mirrors /auth/callback/route.ts so email + OAuth paths land in the same
  // place. Fail-closed: any RPC/lookup failure sends them to '/' rather than
  // risk wrong-routing.
  const routeAfterSignIn = async () => {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) {
      router.replace("/admin");
      router.refresh();
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/");
      router.refresh();
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();
    const dest =
      profile?.status === "pending_onboarding" ? "/onboarding"
      : profile?.status === "pending_review"   ? "/pending"
      : profile?.status === "approved"         ? "/community"
      : profile?.status === "rejected"         ? "/rejected"
      : "/";
    router.replace(dest);
    router.refresh();
  };

  const resetForm = () => {
    setFirstName("");
    setSurname("");
    setEmail("");
    setPassword("");
    setRepeatPassword("");
    setError("");
    setEmailSent(false);
    setResendCooldown(0);
    setTcAgreed(false);
    setForgotSent(false);
    setCode("");
    setVerifying(false);
    setVerifyError("");
    refreshTurnstile();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setRole(null);
    resetForm();
  };

  const backToChooser = () => {
    setRole(null);
    resetForm();
  };

  // Imperial students verify via emailed link. We validate the domain
  // client-side and the DB trigger re-checks (defence in depth — see
  // migration 20260529000001).
  const sendStudentVerificationEmail = async (): Promise<string | null> => {
    const trimmedEmail = email.trim().toLowerCase();
    const domain = trimmedEmail.split("@")[1];
    if (!trimmedEmail || !domain || !["ic.ac.uk", "imperial.ac.uk"].includes(domain)) {
      return "Please use your Imperial email address (@imperial.ac.uk or @ic.ac.uk).";
    }

    let signupData: Record<string, string> | undefined;
    if (mode === "signup") {
      const trimmedFirst = cleanName(firstName);
      const trimmedSurname = cleanName(surname);
      if (!trimmedFirst || !trimmedSurname) {
        return "First name and surname are required.";
      }
      if (trimmedFirst.length > 50 || trimmedSurname.length > 50) {
        return "First name and surname must be 50 characters or fewer.";
      }
      if (!isValidName(trimmedFirst) || !isValidName(trimmedSurname)) {
        return "Names can only contain letters, spaces, hyphens, apostrophes and periods.";
      }
      if (!tcAgreed) {
        return "Please agree to the Terms & Conditions and Privacy Policy to continue.";
      }
      signupData = {
        role: "student",
        first_name: trimmedFirst,
        surname: trimmedSurname,
      };
    }

    if (turnstileConfigured && !turnstileToken) {
      return "Please complete the verification challenge below.";
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        shouldCreateUser: mode === "signup",
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: signupData,
        captchaToken: turnstileToken || undefined,
      },
    });
    return otpError ? otpError.message : null;
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const err = await sendStudentVerificationEmail();
    setIsLoading(false);
    refreshTurnstile();
    if (err) {
      setError(err);
      return;
    }
    setEmailSent(true);
    setResendCooldown(60);
  };

  const handleStudentResend = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setError("");
    setIsLoading(true);
    const err = await sendStudentVerificationEmail();
    setIsLoading(false);
    refreshTurnstile();
    if (err) {
      setError(err);
      return;
    }
    setResendCooldown(60);
  };

  // Verify the 6-digit code the student typed. signInWithOtp issues an email
  // OTP (type "email"); verifyOtp needs no PKCE verifier, so it works on any
  // device/browser. On success the session is set in the browser client and we
  // route by status exactly like every other path.
  const handleStudentVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError("");
    setVerifying(true);
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (vErr) {
      setVerifying(false);
      setVerifyError(friendlyVerifyError(vErr.message));
      return;
    }
    await routeAfterSignIn();
  };

  // Re-send the signup confirmation email. Distinct from the student
  // resend: alum verification is a "confirm signup" email (auth.resend
  // with type "signup"), not a passwordless OTP.
  const handleAlumResend = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setError("");
    if (turnstileConfigured && !turnstileToken) {
      setError("Please complete the verification challenge below.");
      return;
    }
    setIsLoading(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        captchaToken: turnstileToken || undefined,
      },
    });
    setIsLoading(false);
    refreshTurnstile();
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setResendCooldown(60);
  };

  // Verify the 6-digit code for an alum signup confirmation (type "signup",
  // matching signUp / resend({ type: "signup" })). Same success routing.
  const handleAlumVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError("");
    setVerifying(true);
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "signup",
    });
    if (vErr) {
      setVerifying(false);
      setVerifyError(friendlyVerifyError(vErr.message));
      return;
    }
    await routeAfterSignIn();
  };

  // Alumni password recovery. Kept on the PKCE link (redirectTo /auth/callback)
  // deliberately — recovery is the highest-stakes flow, so the link alone must
  // not be enough to take over an account. /auth/callback shuttles a valid
  // recovery click on to /reset-password.
  const handleForgotPassword = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address first.");
      return;
    }
    if (turnstileConfigured && !turnstileToken) {
      setError("Please complete the verification challenge below.");
      return;
    }
    setIsLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      captchaToken: turnstileToken || undefined,
    });
    setIsLoading(false);
    refreshTurnstile();
    if (resetError) {
      setError(resetError.message);
      return;
    }
    // resetPasswordForEmail is anti-enumeration (succeeds even for unknown
    // emails), so the confirmation never leaks whether an account exists.
    setForgotSent(true);
    setResendCooldown(60);
  };

  // Clear recovery sub-view state (used both on entering and leaving it).
  const exitForgot = () => {
    setForgotSent(false);
    setError("");
  };

  const handleGoogle = async () => {
    setError("");
    setIsLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
  };

  const handleAlumSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      const trimmedFirst = cleanName(firstName);
      const trimmedSurname = cleanName(surname);
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
      if (password !== repeatPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (!tcAgreed) {
        setError("Please agree to the Terms & Conditions and Privacy Policy to continue.");
        return;
      }
    }

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (turnstileConfigured && !turnstileToken) {
      setError("Please complete the verification challenge below.");
      return;
    }

    setIsLoading(true);

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Without this, the confirmation link redirects to the Supabase
          // Site URL root, which has no code-exchange handler — the alum
          // lands logged-out on the homepage. Point it at /auth/callback so
          // clicking the link establishes a session and routes by status,
          // exactly like the student magic-link flow.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          captchaToken: turnstileToken || undefined,
          // These keys are read by the tg_handle_new_user trigger to populate
          // public.profiles with role/first_name/surname on insert.
          // grad_year is collected later during onboarding.
          data: {
            role: "alum",
            first_name: cleanName(firstName),
            surname: cleanName(surname),
          },
        },
      });
      refreshTurnstile();
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      // "Confirm email" is ON, so signUp returns no session — the user must
      // click the emailed link first. Show the check-your-inbox panel rather
      // than calling routeAfterSignIn (which would find no session and dump
      // them on '/'). This branch also covers Supabase's email-enumeration
      // protection: signing up an already-registered address returns no
      // session and no error, and showing the same panel avoids leaking
      // whether the account exists. If "Confirm email" is ever turned off,
      // data.session is populated and we route immediately.
      if (!data.session) {
        setEmailSent(true);
        setResendCooldown(60);
        return;
      }
      await routeAfterSignIn();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: turnstileToken || undefined },
    });
    refreshTurnstile();
    if (signInError) {
      // Unconfirmed email: Supabase blocks sign-in until the confirmation
      // link is clicked. Don't dead-end on the raw "Email not confirmed"
      // string — resend the confirmation and show the same check-your-inbox
      // panel as signup. (Students recover via an OTP re-send; this is the
      // alum equivalent, the sign-in twin of the signup fix.)
      const unconfirmed =
        signInError.code === "email_not_confirmed" ||
        /not confirmed/i.test(signInError.message);
      if (unconfirmed) {
        // Best-effort resend; the panel also offers a manual "Resend". With
        // captcha enabled this auto-resend can't succeed (the single-use token
        // was just spent by signInWithPassword), so it no-ops here and the
        // user falls back to the panel's manual Resend, which gets a fresh
        // token from the remounted widget.
        await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            captchaToken: turnstileToken || undefined,
          },
        });
        setIsLoading(false);
        setEmailSent(true);
        setResendCooldown(60);
        return;
      }
      setError(signInError.message);
      setIsLoading(false);
      return;
    }
    await routeAfterSignIn();
  };

  const heading =
    mode === "signup" ? (
      <>Join the <em className="text-gold">Foundry.</em></>
    ) : (
      <>Welcome <em className="text-gold">back.</em></>
    );

  const subtitle =
    role === null
      ? mode === "signup"
        ? "Tell us how you're connected to Imperial."
        : "Tell us how you sign in."
      : role === "student"
        ? mode === "signup"
          ? "We'll email a verification code to your Imperial email."
          : "Enter your Imperial email and we'll email you a sign-in code."
        : mode === "signup"
          ? "Your profile will be manually reviewed before access is granted."
          : "Sign in with your email and password.";

  return (
    <div className="relative min-h-screen bg-bg-primary flex flex-col overflow-hidden">
      <BackgroundEffects />

      {/* Top bar */}
      <header className="relative z-10 px-8 py-5">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary">
            ← Back to home
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-8 py-12">
        <div className="w-full max-w-[440px]">

          {/* Heading */}
          <div className="text-center mb-10">
            <h1 className="font-display text-text-primary leading-[1.1] tracking-tight mb-4 text-[clamp(2rem,4vw,2.75rem)]">
              {heading}
            </h1>
            <p className="text-[0.9rem] text-text-secondary font-light leading-[1.7]">
              {subtitle}
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl bg-bg-card border border-border-subtle p-8">

            {/* Error */}
            {error && (
              <div className="mb-5 px-4 py-3 rounded-lg bg-[#ff4d4d]/8 border border-[#ff4d4d]/20 text-[0.8rem] text-[#ff6b6b] leading-relaxed">
                {error}
              </div>
            )}

            {role === null && (
              <Chooser onPick={(r) => { setRole(r); setError(""); }} />
            )}

            {role === "student" && (
              <StudentMagicLinkFlow
                mode={mode}
                firstName={firstName} setFirstName={setFirstName}
                surname={surname} setSurname={setSurname}
                email={email} setEmail={setEmail}
                emailSent={emailSent}
                isLoading={isLoading}
                resendCooldown={resendCooldown}
                tcAgreed={tcAgreed} setTcAgreed={setTcAgreed}
                code={code} setCode={setCode}
                verifying={verifying} verifyError={verifyError}
                onVerify={handleStudentVerify}
                onSubmit={handleStudentSubmit}
                onResend={handleStudentResend}
                onBack={backToChooser}
              />
            )}

            {role === "alum" && (
              <AlumForm
                mode={mode}
                firstName={firstName} setFirstName={setFirstName}
                surname={surname} setSurname={setSurname}
                email={email} setEmail={setEmail}
                password={password} setPassword={setPassword}
                repeatPassword={repeatPassword} setRepeatPassword={setRepeatPassword}
                emailSent={emailSent}
                resendCooldown={resendCooldown}
                isLoading={isLoading}
                tcAgreed={tcAgreed} setTcAgreed={setTcAgreed}
                forgotSent={forgotSent}
                code={code} setCode={setCode}
                verifying={verifying} verifyError={verifyError}
                onVerify={handleAlumVerify}
                onSubmit={handleAlumSubmit}
                onResend={handleAlumResend}
                onGoogle={handleGoogle}
                onForgot={handleForgotPassword}
                onForgotReset={exitForgot}
                onBack={backToChooser}
              />
            )}

            {/* Bot challenge for the auth send-endpoints. One widget for every
                sub-view (request / resend / forgot); remounts via key to mint a
                fresh single-use token after each send. Renders nothing unless
                the public site key is set. */}
            {turnstileConfigured && role !== null && (
              <div className="mt-5 flex justify-center">
                <TurnstileWidget key={turnstileNonce} onToken={setTurnstileToken} />
              </div>
            )}

            {/* Toggle */}
            <div className="mt-6 pt-5 border-t border-border-subtle text-center">
              <p className="text-[0.8rem] text-text-muted">
                {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
                  className="text-gold bg-transparent border-0 cursor-pointer text-[0.8rem] font-medium transition-colors duration-150 hover:text-gold-light"
                >
                  {mode === "signup" ? "Sign in" : "Sign up"}
                </button>
              </p>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-5">
        <div className="max-w-[1200px] mx-auto flex justify-center gap-8">
          <Link href="/privacy" className="text-[0.75rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary">
            Privacy
          </Link>
          <Link href="/terms" className="text-[0.75rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary">
            Terms
          </Link>
          <Link href="/contact" className="text-[0.75rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary">
            Contact
          </Link>
        </div>
      </footer>
    </div>
  );
}

/* ── Chooser ──────────────────────────────────────────────────────── */
function Chooser({ onPick }: { onPick: (r: "student" | "alum") => void }) {
  return (
    <div className="space-y-3">
      <RoleButton
        title="I am a current Imperial student"
        onClick={() => onPick("student")}
      />
      <RoleButton
        title="I am an Imperial alum"
        onClick={() => onPick("alum")}
      />
    </div>
  );
}

function RoleButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-5 py-4 rounded-xl bg-white/[0.03] border border-border hover:border-gold/40 hover:bg-white/[0.05] transition-colors duration-150 cursor-pointer group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.9rem] font-medium text-text-primary">{title}</div>
        <span className="text-text-muted group-hover:text-gold transition-colors">→</span>
      </div>
    </button>
  );
}

/* ── Back link ────────────────────────────────────────────────────── */
function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[0.75rem] text-text-muted hover:text-text-secondary bg-transparent border-0 cursor-pointer transition-colors flex items-center gap-1"
    >
      ← Back
    </button>
  );
}

/* ── Shared OTP code-entry panel ──────────────────────────────────── */
// Shown after an email code is sent (student sign-in/up + alum signup). The
// user types the 6-digit code; onVerify runs the flow-specific verifyOtp.
function CodeEntryPanel({
  mode, email, code, setCode, verifying, verifyError,
  resendCooldown, isLoading, onVerify, onResend, onBack,
}: {
  mode: Mode;
  email: string;
  code: string; setCode: (v: string) => void;
  verifying: boolean; verifyError: string;
  resendCooldown: number; isLoading: boolean;
  onVerify: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const canResend = resendCooldown <= 0 && !isLoading && !verifying;
  return (
    <div className="space-y-5">
      <BackLink onClick={onBack} />
      <form onSubmit={onVerify} className="py-2 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center mx-auto">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-gold" aria-hidden>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h2 className="font-display text-[1.15rem] text-text-primary">Enter your code</h2>
        <p className="text-[0.8rem] text-text-secondary leading-relaxed">
          We emailed a 6-digit code to <span className="text-text-primary">{email}</span>. Enter it below to {mode === "signup" ? "finish signing up" : "sign in"}.
        </p>

        <label htmlFor="otp-code" className="sr-only">Verification code</label>
        <input
          id="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          autoFocus
          className="w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-center text-[1.4rem] tracking-[0.4em] font-medium text-text-primary placeholder:text-text-muted placeholder:tracking-[0.4em] transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]"
        />

        {verifyError && (
          <p className="text-[0.78rem] text-[#ff6b6b] leading-relaxed">{verifyError}</p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || verifying}
          className="w-full flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {verifying ? (
            <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
          ) : (
            "Verify"
          )}
        </button>

        <p className="text-[0.7rem] text-text-muted leading-relaxed">
          The code expires in 30 minutes. Check your spam folder if it doesn&apos;t arrive within a minute.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={onResend}
            disabled={!canResend}
            className="text-[0.8rem] text-gold bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:text-gold-light disabled:text-text-muted disabled:cursor-not-allowed"
          >
            {isLoading
              ? "Resending…"
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Didn’t receive it? Resend"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Student verification-link flow ───────────────────────────────── */
function StudentMagicLinkFlow({
  mode,
  firstName, setFirstName,
  surname, setSurname,
  email, setEmail,
  emailSent, isLoading, resendCooldown,
  tcAgreed, setTcAgreed,
  code, setCode, verifying, verifyError,
  onVerify, onSubmit, onResend, onBack,
}: {
  mode: Mode;
  firstName: string; setFirstName: (v: string) => void;
  surname: string; setSurname: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  emailSent: boolean;
  isLoading: boolean;
  resendCooldown: number;
  tcAgreed: boolean; setTcAgreed: (v: boolean) => void;
  code: string; setCode: (v: string) => void;
  verifying: boolean; verifyError: string;
  onVerify: (e: React.FormEvent) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}) {
  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  if (emailSent) {
    return (
      <CodeEntryPanel
        mode={mode}
        email={email}
        code={code} setCode={setCode}
        verifying={verifying} verifyError={verifyError}
        resendCooldown={resendCooldown} isLoading={isLoading}
        onVerify={onVerify} onResend={onResend} onBack={onBack}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <BackLink onClick={onBack} />

      {mode === "signup" && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="first-name" className="block text-[0.75rem] text-text-muted mb-1.5">First name</label>
            <input
              id="first-name"
              type="text"
              autoComplete="given-name"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputCls}
              maxLength={50}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="surname" className="block text-[0.75rem] text-text-muted mb-1.5">Surname</label>
            <input
              id="surname"
              type="text"
              autoComplete="family-name"
              placeholder="Surname"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              className={inputCls}
              maxLength={50}
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-[0.75rem] text-text-muted mb-1.5">Imperial email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@imperial.ac.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
        <p className="mt-2 text-[0.7rem] text-text-muted leading-relaxed">
          Must end in @imperial.ac.uk or @ic.ac.uk.
        </p>
      </div>

      {mode === "signup" && (
        <SignupDisclosures agreed={tcAgreed} onChange={setTcAgreed} />
      )}

      <button
        type="submit"
        disabled={isLoading || (mode === "signup" && !tcAgreed)}
        className="w-full mt-2 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : (
          mode === "signup" ? "Send verification code" : "Send sign-in code"
        )}
      </button>
    </form>
  );
}

/* ── Alum form ────────────────────────────────────────────────────── */
function AlumForm({
  mode,
  firstName, setFirstName,
  surname, setSurname,
  email, setEmail,
  password, setPassword,
  repeatPassword, setRepeatPassword,
  emailSent, resendCooldown,
  isLoading,
  tcAgreed, setTcAgreed,
  forgotSent,
  code, setCode, verifying, verifyError, onVerify,
  onSubmit, onResend, onGoogle, onForgot, onForgotReset, onBack,
}: {
  mode: Mode;
  firstName: string; setFirstName: (v: string) => void;
  surname: string; setSurname: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  repeatPassword: string; setRepeatPassword: (v: string) => void;
  emailSent: boolean;
  resendCooldown: number;
  isLoading: boolean;
  tcAgreed: boolean; setTcAgreed: (v: boolean) => void;
  forgotSent: boolean;
  code: string; setCode: (v: string) => void;
  verifying: boolean; verifyError: string;
  onVerify: (e: React.FormEvent) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onGoogle: () => void;
  onForgot: () => void;
  onForgotReset: () => void;
  onBack: () => void;
}) {
  const [forgotView, setForgotView] = useState(false);

  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

  // After signup, "Confirm email" requires the alum to verify before they have
  // a session. Show the shared code-entry panel; the resend re-sends the signup
  // confirmation (type "signup").
  if (emailSent) {
    return (
      <CodeEntryPanel
        mode={mode}
        email={email}
        code={code} setCode={setCode}
        verifying={verifying} verifyError={verifyError}
        resendCooldown={resendCooldown} isLoading={isLoading}
        onVerify={onVerify} onResend={onResend} onBack={onBack}
      />
    );
  }

  // Password-recovery sub-view (sign-in only). Sends a PKCE reset link to the
  // entered email; it lands on /auth/callback?next=/reset-password.
  if (forgotView) {
    const canSend = resendCooldown <= 0 && !isLoading;
    const backToSignIn = () => { onForgotReset(); setForgotView(false); };

    if (forgotSent) {
      return (
        <div className="space-y-5">
          <BackLink onClick={backToSignIn} />
          <div className="py-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center mx-auto">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-gold" aria-hidden>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="font-display text-[1.15rem] text-text-primary">Check your inbox</h2>
            <p className="text-[0.8rem] text-text-secondary leading-relaxed">
              If an account exists for <span className="text-text-primary">{email}</span>, we&apos;ve sent a password-reset link.
            </p>
            <p className="text-[0.7rem] text-text-muted leading-relaxed">
              The link expires in 30 minutes. Open it in the same browser you&apos;re using now.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onForgot}
                disabled={!canSend}
                className="text-[0.8rem] text-gold bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:text-gold-light disabled:text-text-muted disabled:cursor-not-allowed"
              >
                {isLoading
                  ? "Resending…"
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Didn’t receive it? Resend"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={(e) => { e.preventDefault(); onForgot(); }} className="space-y-4">
        <BackLink onClick={backToSignIn} />
        <div className="space-y-1.5">
          <h2 className="font-display text-[1.15rem] text-text-primary">Reset your password</h2>
          <p className="text-[0.8rem] text-text-secondary leading-relaxed">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        </div>
        <div>
          <label htmlFor="reset-email" className="block text-[0.75rem] text-text-muted mb-1.5">Email</label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={resendCooldown > 0 || isLoading}
          className="w-full mt-1 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isLoading ? (
            <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
          ) : resendCooldown > 0 ? (
            `Resend in ${resendCooldown}s`
          ) : (
            "Send reset link"
          )}
        </button>
        <p className="text-[0.72rem] text-text-muted leading-relaxed text-center px-2">
          Signed up with Google? Use <span className="text-text-secondary">Continue with Google</span> instead.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <BackLink onClick={onBack} />

      <button
        type="button"
        onClick={onGoogle}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl bg-white text-[#1a1a1a] text-[0.85rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-white/90 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {/* OAuth can't distinguish signup from sign-in client-side, and the
          checkbox only renders in signup mode, so consent for the Google path
          is captured by this always-visible notice (affirmative action + clear
          terms) rather than the hard checkbox gate used for email/password. */}
      <p className="text-[0.72rem] text-text-muted leading-relaxed text-center px-2">
        By continuing with Google, you agree to our{" "}
        <Link href="/terms" target="_blank" className="text-gold hover:text-gold-light no-underline">
          Terms &amp; Conditions
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className="text-gold hover:text-gold-light no-underline">
          Privacy Policy
        </Link>
        .
      </p>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-border-subtle" />
        <span className="text-[0.7rem] text-text-muted uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-border-subtle" />
      </div>

      {mode === "signup" && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="first-name" className="block text-[0.75rem] text-text-muted mb-1.5">First name</label>
            <input
              id="first-name"
              type="text"
              autoComplete="given-name"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputCls}
              maxLength={50}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="surname" className="block text-[0.75rem] text-text-muted mb-1.5">Surname</label>
            <input
              id="surname"
              type="text"
              autoComplete="family-name"
              placeholder="Surname"
              value={surname}
              onChange={(e) => setSurname(e.target.value)}
              className={inputCls}
              maxLength={50}
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-[0.75rem] text-text-muted mb-1.5">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[0.75rem] text-text-muted mb-1.5">Password</label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
        />
      </div>

      {mode === "signin" && (
        <div className="-mt-1 text-right">
          <button
            type="button"
            onClick={() => { onForgotReset(); setForgotView(true); }}
            className="text-[0.75rem] text-gold bg-transparent border-0 cursor-pointer transition-colors duration-150 hover:text-gold-light"
          >
            Forgot your password?
          </button>
        </div>
      )}

      {mode === "signup" && (
        <div>
          <label htmlFor="repeat-password" className="block text-[0.75rem] text-text-muted mb-1.5">Repeat password</label>
          <input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
            value={repeatPassword}
            onChange={(e) => setRepeatPassword(e.target.value)}
            className={inputCls}
          />
        </div>
      )}

      {mode === "signup" && (
        <SignupDisclosures agreed={tcAgreed} onChange={setTcAgreed} />
      )}

      <button
        type="submit"
        disabled={isLoading || (mode === "signup" && !tcAgreed)}
        className="w-full mt-2 flex items-center justify-center px-6 py-3.5 rounded-xl bg-gold text-bg-primary text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-gold-light hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#0c0c0b]/30 border-t-[#0c0c0b] rounded-full animate-spin" />
        ) : (
          mode === "signup" ? "Create account" : "Sign in"
        )}
      </button>
    </form>
  );
}

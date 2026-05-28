"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    <Link href="/" className="flex items-center gap-2 no-underline">
      <span className="w-7 h-7 rounded-md bg-gold flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L13 4.5V9.5L7 13L1 9.5V4.5L7 1Z" stroke="#0c0c0b" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-[1.1rem] text-text-primary tracking-tight">Foundry</span>
    </Link>
  );
}

/* ── Microsoft icon ───────────────────────────────────────────────── */
function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 23 23" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
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

  // The /auth/callback route bounces failed OAuth attempts back here with
  // ?error=...; read it on mount (not during render — that would cause
  // a hydration mismatch since the server never sees window.location),
  // then strip it from the URL so a refresh doesn't re-show.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("error");
    if (!e) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(e);
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

  const handleMicrosoft = async () => {
    setError("");
    setIsLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email openid profile",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
    // On success, Supabase redirects to Microsoft; no further work here.
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
      if (!firstName.trim() || !surname.trim()) {
        setError("First name and surname are required.");
        return;
      }
      if (password !== repeatPassword) {
        setError("Passwords do not match.");
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

    setIsLoading(true);

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // These keys are read by the tg_handle_new_user trigger to populate
          // public.profiles with role/first_name/surname on insert.
          // grad_year is collected later during onboarding.
          data: {
            role: "alum",
            first_name: firstName.trim(),
            surname: surname.trim(),
          },
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }
      await routeAfterSignIn();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
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
        ? "We verify your Imperial affiliation via Microsoft."
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
          <Link href="/" className="text-[0.8rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary">
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
              <StudentFlow
                mode={mode}
                isLoading={isLoading}
                onSubmit={handleMicrosoft}
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
                isLoading={isLoading}
                onSubmit={handleAlumSubmit}
                onGoogle={handleGoogle}
                onBack={backToChooser}
              />
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
          {["Privacy", "Terms", "Contact"].map((link) => (
            <a key={link} href="#" className="text-[0.75rem] text-text-muted no-underline transition-colors duration-150 hover:text-text-secondary">
              {link}
            </a>
          ))}
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

/* ── Student flow ─────────────────────────────────────────────────── */
function StudentFlow({
  mode, isLoading, onSubmit, onBack,
}: {
  mode: Mode;
  isLoading: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <BackLink onClick={onBack} />
      <button
        type="button"
        onClick={onSubmit}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-white text-[#1a1a1a] text-[0.9rem] font-medium tracking-wide border-0 cursor-pointer transition-all duration-200 hover:bg-white/90 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {isLoading ? (
          <div className="w-[18px] h-[18px] border-2 border-[#1a1a1a]/30 border-t-[#1a1a1a] rounded-full animate-spin" />
        ) : (
          <>
            <MicrosoftIcon />
            {mode === "signup" ? "Continue with Microsoft" : "Sign in with Microsoft"}
          </>
        )}
      </button>
      <p className="text-[0.775rem] text-text-muted leading-relaxed text-center">
        You&apos;ll be redirected to Microsoft to sign in with your Imperial account.
      </p>
    </div>
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
  isLoading, onSubmit, onGoogle, onBack,
}: {
  mode: Mode;
  firstName: string; setFirstName: (v: string) => void;
  surname: string; setSurname: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  repeatPassword: string; setRepeatPassword: (v: string) => void;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onGoogle: () => void;
  onBack: () => void;
}) {
  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

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

      <button
        type="submit"
        disabled={isLoading}
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

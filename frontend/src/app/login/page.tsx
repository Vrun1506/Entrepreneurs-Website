"use client";

import Link from "next/link";
import { useState } from "react";

/* ── Grad years (current year down to 1950) ───────────────────────── */
const CURRENT_YEAR = new Date().getFullYear();
const GRAD_YEARS = Array.from(
  { length: CURRENT_YEAR - 1949 },
  (_, i) => CURRENT_YEAR - i,
);

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

/* ── Page ─────────────────────────────────────────────────────────── */
type Mode = "signin" | "signup";
type Role = "student" | "alum" | null;

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signup");
  const [role, setRole] = useState<Role>(null);

  // Alum form fields
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [gradYear, setGradYear] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setFirstName("");
    setSurname("");
    setEmail("");
    setPassword("");
    setRepeatPassword("");
    setGradYear("");
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

  const handleMicrosoft = () => {
    setError("");
    setIsLoading(true);
    // TODO: Supabase Auth — Microsoft OAuth, single-tenant against Imperial's Azure AD tenant.
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleAlumSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      if (!firstName.trim() || !surname.trim()) {
        setError("First name and surname are required.");
        return;
      }
      if (!gradYear) {
        setError("Please select your graduation year.");
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
    // TODO: Supabase Auth — email/password sign-up / sign-in for alumni.
    setTimeout(() => setIsLoading(false), 1000);
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
                gradYear={gradYear} setGradYear={setGradYear}
                isLoading={isLoading}
                onSubmit={handleAlumSubmit}
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
  gradYear, setGradYear,
  isLoading, onSubmit, onBack,
}: {
  mode: Mode;
  firstName: string; setFirstName: (v: string) => void;
  surname: string; setSurname: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  repeatPassword: string; setRepeatPassword: (v: string) => void;
  gradYear: string; setGradYear: (v: string) => void;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  const inputCls =
    "w-full px-4 py-3 bg-white/[0.03] border border-border rounded-lg text-[0.85rem] text-text-primary placeholder:text-text-muted outline-none transition-colors duration-150 focus:border-gold/50 focus:bg-white/[0.05]";

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
        <>
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

          <div>
            <label htmlFor="grad-year" className="block text-[0.75rem] text-text-muted mb-1.5">Year you graduated from Imperial</label>
            <select
              id="grad-year"
              value={gradYear}
              onChange={(e) => setGradYear(e.target.value)}
              className={`${inputCls} appearance-none cursor-pointer`}
            >
              <option value="" disabled>Select year</option>
              {GRAD_YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </>
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

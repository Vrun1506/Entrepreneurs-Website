import Link from "next/link";

// TODO: Replace this placeholder with the final Privacy Policy text,
// reviewed against UK GDPR requirements. The signup flow links here
// from SignupDisclosures.

export const metadata = {
  title: "Privacy Policy · Foundry",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-16">
      <div className="max-w-[720px] mx-auto">
        <Link href="/login" className="text-[0.8rem] text-text-muted no-underline hover:text-text-secondary transition-colors">
          ← Back
        </Link>
        <div className="mt-6 mb-10">
          <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Legal</div>
          <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-[0.825rem] text-text-muted mt-3">
            Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        </div>

        <div className="rounded-2xl bg-bg-card border border-[#ff4d4d]/30 px-6 py-5 mb-8 text-[0.85rem] text-[#ff8b8b] leading-relaxed">
          <strong>Placeholder.</strong> Replace this page&apos;s content with the finalised Privacy Policy reviewed
          against UK GDPR before launch. The signup flow links here and the checkbox refers to this document.
        </div>

        <article className="space-y-6 text-[0.875rem] text-text-secondary leading-relaxed">
          <Section title="1. What we collect">
            <p>When you sign up we collect your name, email address, and (during onboarding) the course you study/studied, graduation year, optional bio, LinkedIn/GitHub/portfolio links, and the sectors and skills you select. When you post a listing we store its content and metadata.</p>
          </Section>
          <Section title="2. How we use it">
            <p>To verify your eligibility (current student domain check, alumni admin review), to show your profile in the member directory you opted into, to send transactional emails (verification, decisions, account notices, contact replies), and to operate features like newest-members banner and filtering.</p>
          </Section>
          <Section title="3. Lawful basis (UK GDPR)">
            <p>Consent. You opt in when you sign up. You can withdraw consent at any time by deleting your account, which removes all of your profile data, posted opportunities, events, and VC/grant submissions from our systems.</p>
          </Section>
          <Section title="4. Where it&apos;s stored and who processes it">
            <p>Your data is hosted in UK/EU regions and does not leave UK/EU jurisdictions during normal operation. We use the following sub-processors:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Supabase</strong> (EU, London) — database, authentication, and file storage. Holds your profile and the content you post.</li>
              <li><strong>Vercel</strong> (EU, Frankfurt) — application hosting and serving.</li>
              <li><strong>Resend</strong> (EU) — sending transactional email; processes recipient address and message content in transit.</li>
              <li><strong>Cloudflare</strong> (EU) — DNS, inbound contact-email routing, edge protection, and the Turnstile anti-spam challenge on our forms. Processes request metadata (e.g. IP address) to block abuse.</li>
              <li><strong>Upstash</strong> (EU) — rate limiting. Stores only short-lived request counters keyed to your user ID or IP; no profile data.</li>
              <li><strong>Sentry</strong> (EU) — error monitoring. May capture technical diagnostics (e.g. URL, browser, user ID) when an error occurs; we do not send form contents.</li>
              <li><strong>PostHog</strong> (EU) — privacy-friendly, cookieless product analytics (which pages and features are used).</li>
            </ul>
          </Section>
          <Section title="5. Who can see it">
            <p>Your profile (name, course, grad year, bio, working_on, sectors, skills, links) is visible to other approved Foundry members in the directory. Your email address is not displayed unless you explicitly tick the &quot;visible&quot; box on a listing&apos;s contact email. Admins can see all profile data including emails for operational and review purposes.</p>
          </Section>
          <Section title="6. Email">
            <p>We use your email only for transactional purposes (sign-in, decisions, account/content notices, contact replies). We do not send marketing emails or share your address with third parties.</p>
          </Section>
          <Section title="7. Retention and deletion">
            <p>We hold your data while your account is active. Deleting your account (via /settings) removes your profile and the content you posted. Admins also have a graduate-cleanup tool that removes student accounts whose graduation year has passed, with a congratulations notice giving you the option to reapply as an alum.</p>
          </Section>
          <Section title="8. Your rights">
            <p>Under UK GDPR you have the right to access, correct, export, or delete your personal data. Use the profile editor at /profile to amend, or the Delete Account flow at /settings to remove. For other rights requests, contact the team via /settings → Contact the team.</p>
          </Section>
          <Section title="9. Cookies">
            <p>We use one essential cookie for your sign-in session (managed by Supabase). Cloudflare Turnstile may set a temporary token to confirm you are not a bot when you submit a form. Our product analytics (PostHog) runs cookieless. We do not use tracking or marketing cookies.</p>
          </Section>
          <Section title="10. Contact">
            <p>Data protection contact: via /settings → Contact the team in the app.</p>
          </Section>
        </article>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[1.05rem] text-text-primary font-medium tracking-tight mb-2">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

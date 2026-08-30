import Link from "next/link";

// Privacy Policy — UK GDPR / Data Protection Act 2018.
// Controller: IC Founders Ltd (Companies House 17171277). Grounded in the
// app's actual data flows and sub-processors. Reviewed facts as of the
// LAST_UPDATED date below; the signup flow links here from SignupDisclosures.

export const metadata = {
  title: "Privacy Policy · Foundry",
};

const LAST_UPDATED = "29 August 2026";

export default function PrivacyPage() {
  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-bg-primary text-text-primary px-8 py-16">
      <div className="max-w-[720px] mx-auto">
        <Link href="/login" className="text-[0.8rem] text-text-muted no-underline hover:text-text-secondary transition-colors">
          ← Back
        </Link>
        <div className="mt-6 mb-10 rule-draw pt-6">
          <p className="label-wide text-text-secondary mb-3">Legal</p>
          <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-[0.825rem] text-text-muted mt-3">
            Last updated: {LAST_UPDATED}.
          </p>
        </div>

        <article className="space-y-6 text-[0.875rem] text-text-secondary leading-relaxed">
          <Section title="1. Who we are">
            <p>
              Foundry is a private community platform for Imperial College London students and alumni
              interested in the startup ecosystem, operated under the name &ldquo;Imperial Entrepreneurs&rdquo;.
            </p>
            <p className="mt-2">
              The data controller responsible for your personal data is <strong>IC Founders Ltd</strong>, a
              company limited by guarantee registered in England and Wales (company number{" "}
              <strong>17171277</strong>), registered office 71–75 Shelton Street, Covent Garden, London,
              WC2H 9JQ. In this policy &ldquo;we&rdquo;, &ldquo;us&rdquo; and &ldquo;our&rdquo; mean IC Founders Ltd.
            </p>
            <p className="mt-2">
              Questions about this policy or your data, including any request to exercise your rights, can be sent
              to <strong>contact@imperialentrepreneurs.com</strong>.
            </p>
          </Section>

          <Section title="2. The personal data we collect">
            <p>We collect only what we need to run a members&rsquo; directory and the features you use:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Account data</strong> — your name and email address. If you sign in with Google, Google provides your name and email to us (see section 4).</li>
              <li><strong>Profile data (onboarding)</strong> — the course you study or studied, your graduation year, an optional short bio and &ldquo;what you&rsquo;re working on&rdquo;, optional LinkedIn / GitHub / portfolio links, and the sectors and skills you select.</li>
              <li><strong>Membership status</strong> — whether you are a current student or alum, and your approval status, which our admins set during review.</li>
              <li><strong>Content you post</strong> — the opportunities, events, and VC / grant listings you submit, including any contact email you choose to attach to a listing; and your community posts, including any images you attach and the text you write to describe them.</li>
              <li><strong>Reports and moderation records</strong> — if you report a community post, what you tell us about it; and if one of your posts is removed by an admin, a record of the post and the reason it was removed. See section 8 for how long we keep these.</li>
              <li><strong>Engagement data</strong> — anonymised-to-others counts of views and click-throughs on listings you posted, so you can see how your content performs.</li>
              <li><strong>Technical and security data</strong> — your IP address and request metadata, used by our edge provider and rate limiter to prevent abuse, and limited error diagnostics (e.g. URL, browser, your user ID) if something goes wrong.</li>
            </ul>
            <p className="mt-2">
              We do <strong>not</strong> collect special category data (such as health, ethnicity, or political
              opinions), and we do not ask for payment details — Foundry is free to use.
            </p>
          </Section>

          <Section title="3. How we use your data, and our lawful basis">
            <p>Under the UK GDPR we must have a lawful basis for each use of your data:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong>Creating and running your account and verifying your eligibility</strong> — to provide the membership service you asked for (performance of a contract under our Terms), supported by your consent at sign-up.</li>
              <li><strong>Showing your profile in the member directory</strong> — your consent. You can withdraw this at any time by editing your profile or deleting your account.</li>
              <li><strong>Sending you service / transactional emails</strong> (sign-in and password reset, decisions on your application and listings, account and content notices, and replies when you contact us) — necessary to perform our contract with you and our legitimate interest in operating the platform.</li>
              <li><strong>Keeping the platform secure</strong> (anti-bot challenges, rate limiting, abuse prevention) — our legitimate interest in protecting members and the service.</li>
              <li><strong>Understanding how the product is used</strong> (cookieless, pseudonymous analytics) — our legitimate interest in improving Foundry. See our <Link href="/cookies" className="text-accent hover:text-accent-light no-underline">Cookie Policy</Link>.</li>
            </ul>
            <p className="mt-2">
              We do not use your data for advertising, we do not sell it, and we do not carry out automated
              decision-making that produces legal or similarly significant effects about you.
            </p>
          </Section>

          <Section title="4. Sign-in with Google">
            <p>
              If you choose to sign in with Google, Google shares your name, email address, and basic profile
              identifier with us so we can create or access your account. We only request this basic profile
              information and do not receive your Google password. Google&rsquo;s handling of your data is governed
              by Google&rsquo;s own privacy policy.
            </p>
          </Section>

          <Section title="5. Who processes your data on our behalf">
            <p>
              Your data is hosted in UK / EU regions. We use the following sub-processors, each under a data
              processing agreement and each receiving only the data needed for its role:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Supabase</strong> (EU / London) — database, authentication, and storage. Holds your profile and the content you post.</li>
              <li><strong>Vercel</strong> (EU / Frankfurt) — application hosting and serving.</li>
              <li><strong>Microsoft Azure</strong> (UK South) — image storage and processing. Holds images you attach to community posts; the processing service strips embedded metadata, including any location recorded by your camera, before an image is stored.</li>
              <li><strong>Resend</strong> (EU) — sending our service emails; processes the recipient address and message content in transit.</li>
              <li><strong>Cloudflare</strong> (EU) — DNS, inbound contact-email routing, edge security, and the Turnstile anti-bot challenge on our forms. Processes request metadata such as your IP address to block abuse.</li>
              <li><strong>Upstash</strong> (EU) — rate limiting. Stores only short-lived request counters keyed to your user ID or IP; no profile data.</li>
              <li><strong>Sentry</strong> (EU) — error monitoring. May capture technical diagnostics when an error occurs; we do not send it form contents.</li>
              <li><strong>PostHog</strong> (EU) — privacy-friendly, cookieless product analytics (which pages and features are used), tied to a pseudonymous user ID only.</li>
            </ul>
          </Section>

          <Section title="6. International transfers">
            <p>
              We aim to keep your data within the UK and EU. Some of our providers are headquartered outside the
              UK / EU; where any transfer of personal data outside the UK takes place, it is protected by an
              appropriate safeguard recognised under UK law (such as UK adequacy regulations or the International
              Data Transfer Agreement / Standard Contractual Clauses).
            </p>
          </Section>

          <Section title="7. Who can see your data">
            <p>
              Your profile (name, course, graduation year, bio, what you&rsquo;re working on, sectors, skills, and
              links) is visible to other approved Foundry members in the directory. Your email address is{" "}
              <strong>not</strong> displayed unless you explicitly choose to make a listing&rsquo;s contact email
              visible. Our admins can see all profile data, including email addresses, for review and operational
              purposes. We do not make your data public on the open internet.
            </p>
          </Section>

          <Section title="8. How long we keep it">
            <p>
              We keep your data while your account is active. When you delete your account (Settings → Delete
              account) we remove your profile and the content you posted from our live systems. Our admins also run
              a graduate-cleanup that removes current-student accounts whose graduation year has passed, with a
              notice giving you the option to reapply as an alum. Residual copies may persist briefly in encrypted
              backups before being overwritten on our providers&rsquo; normal backup cycle.
            </p>
            <p className="mt-3">
              Some things have a fixed retention period, enforced automatically:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Community posts and their images — 7 days.</strong> Every post is deleted automatically seven days after it is published, along with any images attached to it. You can delete a post sooner at any time from Community → My posts.</li>
              <li><strong>Moderation records — 12 months.</strong> If an admin removes one of your posts, we keep a record of the removal: the post&rsquo;s title and text, the reason given, and who removed it and when. We keep this so that a removal can be explained, reviewed, or defended if it is challenged, which is a legitimate interest and, where the record relates to a potential legal claim, is permitted under Article 17(3)(e) UK GDPR even if you ask us to erase your data. It is deleted after 12 months unless a specific dispute is still live.</li>
              <li><strong>Reports — 12 months.</strong> If you report a post, we keep your report, what you told us, and the outcome, on the same 12-month clock.</li>
            </ul>
          </Section>

          <Section title="9. How we protect it">
            <p>
              Access to your data is restricted by database row-level security, server-side authorisation checks,
              and least-privilege access controls. Data is encrypted in transit. We keep the platform patched and
              monitor for errors and abuse. No system is perfectly secure, but we take reasonable and proportionate
              measures appropriate to a community of this size.
            </p>
          </Section>

          <Section title="10. Your rights">
            <p>Under the UK GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>access the personal data we hold about you;</li>
              <li>have inaccurate data corrected — you can edit most of it yourself in your profile;</li>
              <li>have your data erased — use Settings → Delete account, or contact us;</li>
              <li>restrict or object to certain processing;</li>
              <li>data portability (receive your data in a portable format); and</li>
              <li>withdraw consent at any time, without affecting processing done before withdrawal.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these, email <strong>contact@imperialentrepreneurs.com</strong> or use the in-app
              contact form. We will respond within one month.
            </p>
          </Section>

          <Section title="11. Cookies">
            <p>
              We use only strictly necessary cookies (for your sign-in session and security) and run our analytics
              cookielessly, so we do not show a cookie banner. Full details are in our{" "}
              <Link href="/cookies" className="text-accent hover:text-accent-light no-underline">Cookie Policy</Link>.
            </p>
          </Section>

          <Section title="12. Children">
            <p>
              Foundry is intended for Imperial College London students and alumni and is not directed at children
              under 18. We do not knowingly collect data from anyone under 18.
            </p>
          </Section>

          <Section title="13. Changes to this policy">
            <p>
              We may update this policy from time to time. If we make a material change we will notify members by
              email at their registered address. The date at the top shows when it was last updated.
            </p>
          </Section>

          <Section title="14. Contact and complaints">
            <p>
              Contact us about your data at <strong>contact@imperialentrepreneurs.com</strong>. If you are
              unhappy with how we have handled your data you can complain to the UK Information Commissioner&rsquo;s
              Office (ICO) at{" "}
              <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-light no-underline">ico.org.uk/make-a-complaint</a>{" "}
              or by calling 0303 123 1113. We would appreciate the chance to resolve it with you first.
            </p>
          </Section>
        </article>
      </div>
    </main>
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

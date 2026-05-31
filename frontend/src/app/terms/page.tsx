import Link from "next/link";

// TODO: Replace this placeholder with the final Terms & Conditions text
// reviewed by Imperial College Union / your legal contact. The signup
// flow links here from SignupDisclosures.

export const metadata = {
  title: "Terms & Conditions · Foundry",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary px-8 py-16">
      <div className="max-w-[720px] mx-auto">
        <Link href="/login" className="text-[0.8rem] text-text-muted no-underline hover:text-text-secondary transition-colors">
          ← Back
        </Link>
        <div className="mt-6 mb-10">
          <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Legal</div>
          <h1 className="font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.1] tracking-tight">
            Terms &amp; Conditions
          </h1>
          <p className="text-[0.825rem] text-text-muted mt-3">
            Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        </div>

        <div className="rounded-2xl bg-bg-card border border-[#ff4d4d]/30 px-6 py-5 mb-8 text-[0.85rem] text-[#ff8b8b] leading-relaxed">
          <strong>Placeholder.</strong> Replace this page&apos;s content with the finalised Terms &amp; Conditions
          drafted with Imperial College Union and/or your legal contact before launch. The signup flow links here
          and the checkbox refers to this document.
        </div>

        <article className="prose-foundry space-y-6 text-[0.875rem] text-text-secondary leading-relaxed">
          <Section title="1. Who we are">
            <p>Foundry is a private community platform run by Imperial Entrepreneurs, a registered Imperial College Union society, for Imperial students and alumni interested in the startup ecosystem.</p>
          </Section>
          <Section title="2. Eligibility">
            <p>To sign up as a current student, you need a valid Imperial email address (@imperial.ac.uk or @ic.ac.uk). To sign up as an alum, you confirm you have studied at Imperial; admins review alumni applications before granting access.</p>
          </Section>
          <Section title="3. Member responsibilities">
            <p>You agree not to post content that is unlawful, misleading, discriminatory, harassing, or that misrepresents an opportunity, event, or funding source. Admins may remove content or accounts that violate these terms.</p>
          </Section>
          <Section title="4. Content you post">
            <p>You retain ownership of content you post. By posting, you grant Foundry a non-exclusive licence to display it to other approved members. When you delete your account or a listing, that content is removed from Foundry.</p>
          </Section>
          <Section title="5. Account suspension and removal">
            <p>We may suspend or remove accounts that violate these terms or that we cannot verify as belonging to current Imperial students or alumni. We will notify you by email when this happens, with a reason.</p>
          </Section>
          <Section title="6. Disclaimer of liability">
            <p>Foundry is a directory and signposting service. We do not endorse the opportunities, events, or VCs listed. Members are responsible for their own due diligence before applying, attending, or engaging.</p>
          </Section>
          <Section title="7. Changes to these terms">
            <p>We may update these terms; material changes will be notified to members by email at the registered address. Continued use after notification constitutes acceptance.</p>
          </Section>
          <Section title="8. Contact">
            <p>For questions, contact the team via the in-app contact form on /settings → Contact the team.</p>
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

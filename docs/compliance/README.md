# Imperial Entrepreneurs — Data Protection & Governance Portfolio

These documents are prepared to support engagement with **Imperial College London's
Data Protection Office (DPO)** and legal team. They describe the actual technical
implementation of the Imperial Entrepreneurs ("Foundry") platform as built, so that
Imperial governance can review, correct, and formalise them in their own required
templates (e.g. DART 2.0).

> **Status:** DRAFT for review. Authored from the live codebase, not from assumptions.
> Items marked **⚠ CONFIRM** require a factual input only the project owner / Imperial
> can supply (e.g. vendor account region settings, named role-holders). Nothing here is
> legal advice — Imperial's DPO and legal team own the final wording and sign-off.

## Contents

| # | Document | Purpose |
|---|----------|---------|
| 00 | (Owner-supplied) DART 2.0 Registration draft | Imperial's internal registration form |
| 01 | [Architecture & Data Flow Map](./01-architecture-data-flow-map.md) | What the system is, what data flows where, which processors touch it |
| 02 | [Record of Processing Activities (ROPA)](./02-ropa.md) | Art. 30 UK GDPR record: data, purpose, basis, retention, recipients |
| 03 | [Third-Party Processor & DPA Register](./03-third-party-dpa-register.md) | Every sub-processor, the data they handle, and DPA status |
| 04 | [Internal Data Handling Protocol](./04-internal-data-handling-protocol.md) | How the team accesses, secures, and minimises data |
| 05 | [Data Breach Incident Response Plan](./05-data-breach-incident-response-plan.md) | Detection, containment, ICO/Imperial notification, recovery |
| 06 | [Information Items Checklist](./06-info-items-checklist.md) | Outstanding factual inputs |
| 07 | [DPIA Screening — Community posts](./07-dpia-screening.md) | Art. 35 screening for the member-to-member feed, and why a full DPIA is not required |

## Three inputs needed before these are presentation-ready

1. **Supabase project region** — confirm in the Supabase dashboard (Settings → General).
   The DART draft assumes UK; this must be verified, not assumed.
2. **Vendor data-residency settings** — confirm the **Sentry** org is an EU-region org,
   the **Upstash** Redis database region, and the **Resend** account region. Each supports
   EU residency; the configuration choice must be confirmed per account.
3. **Named role-holders** — the **Information Asset Owner (IAO)** (the staff member /
   faculty sponsor / Union officer legally accountable) and the **Information Asset
   Administrator (IAA)** (the student running day-to-day operations).

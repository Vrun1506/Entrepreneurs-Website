# 09 · Online Safety Act — Illegal Content Risk Assessment

> **Status:** DRAFT for review and adoption. Requires sign-off at §8.
> **Service:** Foundry (imperialentrepreneurs.com), operated by IC Founders Ltd.
> **Assessment date:** ⚠ CONFIRM on adoption · **Review due:** 12 months after,
> or on any material change to the service.
>
> This is a working draft written from the codebase so that a human with
> authority can review, correct and adopt it. It is not legal advice, and it
> has not been reviewed by a solicitor or by Ofcom.

## 1. Why this document exists, separately from the DPIA

[07 DPIA Screening](./07-dpia-screening.md) addresses **UK GDPR Article 35** —
whether the processing of personal data is high-risk. It concludes a full DPIA
is not required.

This document addresses a **different and independent duty**. The Online Safety
Act 2023 requires a provider of a user-to-user service with links to the UK to
carry out a written illegal content risk assessment, keep it up to date, and
keep a record of it. Concluding that risk is low does not remove the duty to
have assessed it in writing.

Both duties apply. Neither substitutes for the other.

## 2. The service being assessed

Foundry is a **members-only community platform** for Imperial Entrepreneurs.

| | |
|---|---|
| User base | ~1,000–2,000, capped by Imperial affiliation |
| Registration | Imperial email verification, or an alumni route with admin approval |
| Public access | None. Every content surface requires an approved account |
| Search indexing | `noindex, nofollow` on all member surfaces |
| Children | Not permitted or expected — university members only |
| Revenue | None. No advertising, no recommendation algorithm |

**The user-to-user functionality in scope is one feature:** the Community feed.
Members publish a title, a body of up to 3,000 characters, and up to two
images. Posts are destroyed automatically after seven days.

Out of scope: opportunity, event and VC/grant listings all pass through admin
approval before anyone else sees them, so they are not user-to-user content in
the relevant sense. There is no private messaging, no comments, no likes, no
group creation and no live streaming.

## 3. Risk assessment by illegal content category

Assessed against the kinds of illegal content the Act requires providers to
consider. Likelihood reflects this specific service — a closed, identity-linked
community of university members and alumni — not the open internet.

| Category | Likelihood | Reasoning | Controls |
|---|---|---|---|
| **Terrorism content** | Very low | No anonymity, no reach beyond members, no public distribution | Report route; 24h takedown; account termination |
| **CSAM** | Very low | Adult university population; no minors; no private messaging or file sharing | Images re-encoded and never served publicly; report route; **immediate escalation, see §6** |
| **Harassment, stalking, threats** | **Low–medium — the most plausible risk here** | A closed community where members know each other in person is where interpersonal conflict actually occurs | Real-name accounts; dedicated report category; admin takedown with reason; ban removes all posts |
| **Hate speech** | Low | Identity-linked posting is a strong deterrent | Dedicated report category; takedown; termination |
| **Fraud and financial offences** | **Low–medium** | A startup community discussing funding is a plausible target for investment scams and fake opportunities | Approved members only; links rendered with their true hostname (see §4); report category; rate limits |
| **Drugs, weapons** | Very low | No marketplace functionality | Report route; takedown |
| **Intimate image abuse** | Low | No private messaging | Images destroyed on takedown and drained from storage |
| **Encouraging self-harm** | Low | Professional-context feed | Report category; takedown; signposting |
| **Foreign interference** | Very low | Not a public information service | Report route |

**Overall assessment: low risk**, with harassment and fraud the two categories
warranting the most attention. The dominant risk-reducing factors are that the
service is closed, identity-linked, unindexed, and that content self-destructs
in seven days.

## 4. Controls implemented in the product

Every item below is implemented and covered by automated tests. This is not a
statement of intent.

**Access control.** Only approved members can read or write the feed. Approval
requires a verified Imperial address, or admin review for alumni. Every write
path checks approved status rather than merely "signed in" — a distinction that
matters, because a just-banned member keeps a valid session token for up to an
hour.

**Reporting.** Any member can report any post they did not write. Categories
are a fixed list shaped around the illegal-content types above, so the queue can
be triaged by severity rather than read as free text. One report per person per
post, which bounds report-bombing. **A report emails the moderation inbox
immediately** — see [10 Moderation Response Standard](./10-moderation-response-standard.md).

**Takedown.** Admins remove a post with a mandatory written reason. The removal
destroys the post and its images, resolves any open reports, writes a
12-month audit record, and emails the author the reason with an appeal route.

**Complaints loop.** The reporter is emailed the outcome either way. "We looked
and took no action" is a result; silence is not.

**Content-level controls.** Post bodies render as plain text — no markup, no
HTML. Links are filtered to `http`/`https` only and displayed **with their real
hostname**, which is the principal defence against a phishing post dressed as an
Imperial login page. Images are re-encoded server-side, stripping metadata
including GPS coordinates, and SVG is rejected outright.

**Rate limits.** Enforced both at the application and in the database, so they
cannot be bypassed by calling the API directly. 10 posts per day per member,
5 reports.

**Kill switch.** A single configuration flag disables all posting platform-wide
with no code deployment, for use during an incident.

**Automatic expiry.** All posts are destroyed after seven days regardless.

## 5. Record-keeping

| Record | Where | Retention |
|---|---|---|
| Reports received, category, outcome | `post_reports` | 12 months |
| Takedowns: what, by whom, why, snapshot | `post_moderation_log` | 12 months |
| All admin actions | `admin_actions` | Per existing policy |
| This assessment | This document, in version control | Reviewed annually |

## 6. Escalation to law enforcement

⚠ **CONFIRM — this section needs a named decision-maker before adoption.**

Most reports are handled by takedown alone. Two categories are different:

- **CSAM** — remove immediately, do **not** forward or reply-quote the content,
  preserve the record, and report to the Internet Watch Foundation and the
  police without delay. Do not investigate internally.
- **Credible threats to life or safety** — remove, preserve, contact the police,
  and notify Imperial College security if a member of the College is involved.

| | |
|---|---|
| Named escalation decision-maker | ______________________ |
| Deputy | ______________________ |
| Imperial contact for member-safety incidents | ⚠ CONFIRM |

## 7. Judgement, and its limits

On the evidence in §3 the service presents **low risk of illegal content**, and
the controls in §4 are proportionate to it. The reasoning is that the population
is closed and identity-linked, the content is short-lived and unindexed, there
is no private messaging, and there is no algorithmic amplification.

Two honest caveats:

1. **Low risk is not no risk.** Harassment between people who know each other is
   the realistic scenario, and it is the one where a fast, human response
   matters more than any technical control.
2. **This has not been reviewed by a lawyer.** It was drafted from the codebase
   by the engineering side. Ofcom's guidance for user-to-user services should be
   read against it before adoption, and a solicitor should confirm the service
   categorisation.

## 8. Adoption

⚠ **CONFIRM — required before the Community feature is enabled in production.**

| | |
|---|---|
| **Adopted by** | ______________________ (director, IC Founders Ltd) |
| **Date** | ______________________ |
| **Legal review** | ☐ Completed by ____________ ☐ Not yet obtained |
| **Next review due** | ______________________ |

## 9. Triggers for early review

Reassess before the annual date if any of these happen: private messaging or
comments are added; the feed becomes publicly readable; membership opens beyond
Imperial; posts stop expiring; a report involves any §6 category; or Ofcom
publishes guidance that changes the service's categorisation.

Related: [07 DPIA Screening](./07-dpia-screening.md) ·
[08 Retention Decision](./08-retention-decision-moderation-log.md) ·
[10 Moderation Response Standard](./10-moderation-response-standard.md)

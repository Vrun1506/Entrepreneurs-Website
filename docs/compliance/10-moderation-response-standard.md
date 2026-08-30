# 10 · Moderation Response Standard

> **Status:** DRAFT — needs a named person and agreed times at §2 and §3.
> Everything else is implemented in the product.

## 1. The problem this solves

A report button whose rows nobody opens is **worse than no report button**. It
converts "we did not know" into "we were told and did nothing" — a documented
notification, demonstrably ignored, sitting in a table with a timestamp on it.

Two things fix that: a report has to *reach* somebody without anyone
remembering to go and look, and there has to be an agreed time within which
somebody acts.

The first is now built. The second is a decision, below.

## 2. Who

⚠ **CONFIRM before the Community feature is enabled.**

| Role | Person | Responsibility |
|---|---|---|
| **Primary moderator** | ______________________ | Reads the moderation inbox; first response within §3 |
| **Deputy** | ______________________ | Covers absence, holidays, exam periods |
| **Escalation** | ______________________ | Decides on §6 of the OSA assessment: police, IWF, Imperial |

**A deputy is not optional.** The realistic failure of a small team is not that
nobody cares — it is that the one person who reads the inbox has coursework
that week. Two names, or the standard in §3 is fiction.

## 3. How fast

⚠ **CONFIRM. These are proposed, not agreed.** Set times you will actually meet;
a standard you miss is worse evidence than a slower one you keep.

| Category | Acknowledge | Decide | Notes |
|---|---|---|---|
| CSAM, credible threat to life | **Immediately** | Immediately | Remove first, then escalate per OSA §6. Never investigate internally |
| Terrorism, intimate image abuse | 4 hours | 24 hours | Remove on reasonable suspicion; do not wait for certainty |
| Harassment, hate, illegal content | 24 hours | 72 hours | The most likely real category on this platform |
| Fraud, scams, phishing | 24 hours | 72 hours | Check the link hostname; the UI shows it on every post |
| Sexual content, misinformation | 72 hours | 5 working days | |
| Spam, "something else" | 5 working days | 10 working days | |

"Decide" means removed or dismissed, with the reporter emailed either way.

Two natural mitigations worth knowing: **every post expires after seven days
anyway**, so the worst case for anything missed is bounded; and the kill switch
disables all posting instantly if something is going badly wrong.

## 4. What happens now, automatically

Implemented and tested — no human memory required:

1. A member reports a post, choosing a category and writing a reason.
2. `report_post` files it, bounded by a unique index (one report per person per
   post) and a database-level cap of 10 reports per member per day.
3. **The moderation inbox is emailed immediately** — category in the subject
   line so severity is legible without opening it, the reason quoted, and a
   link to the queue. Only on a genuinely new report; duplicates do not
   re-notify, because an inbox that cries wolf gets filtered.
4. The report appears in `/admin/reports`, newest first.
5. On resolution, the reporter is emailed the outcome — **both** for removal and
   for dismissal.
6. A takedown emails the author the reason and the appeal route, and writes a
   12-month audit record.

The notification email deliberately **does not name the reporter** and does not
quote the reported post's body. Both are available in the admin queue behind an
admin session; an inbox is a wider and more forwardable audience than the report
asked for.

**Configure `MODERATION_INBOX_EMAIL`.** If unset it falls back to the contact
inbox, so a report always lands somewhere monitored — but a shared, named
moderation address is better than the general one.

## 5. Deciding: a short guide

**Remove** when content is illegal, targets or identifies someone in a way they
have not consented to, is commercial spam, or breaches the community guidelines
in the Terms of Use. When genuinely unsure and the content is plausibly harmful,
remove it — a post has a seven-day life anyway, and the author gets a written
reason and an appeal route. The asymmetry favours removal.

**Dismiss** when content is merely disagreeable, when the report is a
disagreement rather than a breach, or when the reporter has misunderstood the
feature. Say so in the resolution note; it is emailed to them.

**Escalate** per §6 of the OSA assessment. Do not attempt to investigate CSAM or
a credible threat internally.

Always write a real reason. It goes to the author verbatim, it is what an appeal
is judged against, and it is what a regulator would read.

## 5a. Committee handover

⚠ A student society committee turns over roughly every year. A moderation
standard naming two individuals is therefore **stale by default** within
twelve months, and a named moderator who graduated is worse than no name at
all — it reads as a control that exists on paper.

Fold this into the annual handover, alongside the bank mandate and the
society email accounts:

- Re-fill §2 with the incoming committee's names, and brief them on §5.
- Confirm `MODERATION_INBOX_EMAIL` still reaches somebody. A role address
  that outlives individuals (`moderation@…`) is much better here than a
  personal one, precisely because of this.
- Re-read §3 and change the times if the new committee cannot meet them.
- Re-confirm §6 escalation in [09](./09-osa-illegal-content-risk-assessment.md).

The outgoing primary moderator owns this handover.

## 6. Reviewing the standard

Once a term, look at: how many reports arrived, how long they actually took
against §3, how many were removals versus dismissals, whether any category is
recurring (a pattern is a product problem, not a moderation problem), and
whether any report went unactioned.

`admin_list_post_reports('all', …)` gives the full set. Records are kept for 12
months, so a term's worth is always available.

## 7. Adoption

| | |
|---|---|
| **Agreed by** | ______________________ (director, IC Founders Ltd) |
| **Date** | ______________________ |
| **Primary / deputy briefed** | ☐ Yes |
| **`MODERATION_INBOX_EMAIL` configured** | ☐ Yes |

## 8. Where this is implemented

| | |
|---|---|
| Report RPC | `report_post()` — `supabase/migrations/20260830000002_report_post_returns_inserted.sql` |
| Notification | `sendPostReportEmail()` — `frontend/src/lib/email.ts` |
| Wiring | `reportPost()` — `frontend/src/app/community/actions.ts` |
| Admin queue | `frontend/src/app/admin/reports/` |
| Outcome email | `sendReportOutcomeEmail()` — `frontend/src/lib/email.ts` |
| Tests | `frontend/src/lib/email.test.ts`, `frontend/e2e/community.spec.ts`, `rls_smoke.sql` §31k |

Related: [09 OSA Risk Assessment](./09-osa-illegal-content-risk-assessment.md) ·
[05 Breach Response](./05-data-breach-incident-response-plan.md)

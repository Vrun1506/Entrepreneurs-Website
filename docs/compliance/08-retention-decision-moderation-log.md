# 08 · Retention Decision Record — Moderation Log Surviving Erasure

> **Status:** DRAFT — requires sign-off. See §7.
> **Decision owner:** a director of IC Founders Ltd (the data controller).
> **Reviewer:** Imperial College London Data Protection Office.
> Nothing here is legal advice. This records a decision and its reasoning so
> that somebody with authority can approve, amend, or reject it.

## 1. The decision being asked for

When a member deletes their Foundry account, everything they wrote is
destroyed. **One exception is proposed:** if a moderator has previously removed
one of their community posts, the record of that removal survives.

That record is `public.post_moderation_log`. Concretely, this means the
platform can be in a position of saying:

> *"We deleted your account. We have kept a record that we removed a post of
> yours, why we removed it, and what it said."*

That sentence is the whole of what needs approving. Everything below explains
why it is proposed and what it costs.

## 2. What is actually retained

One row per **admin takedown**. Not per post, not per deletion — a member
deleting their own post, and the automatic 7-day expiry, write nothing here.

| Column | Content |
|---|---|
| `post_id`, `author_id` | Bare UUIDs. **No foreign keys** — see §4 |
| `author_email_snapshot` | The address at the time of removal |
| `admin_id` | Who removed it |
| `reason` | The moderator's stated reason, also emailed to the author |
| `title_snapshot`, `body_snapshot` | The post as published |
| `image_count`, `posted_at`, `removed_at` | Context |
| `purge_after` | Defaults to `now() + 12 months` |
| `legal_hold` | Boolean, default false |

The table has **no RLS policies at all**, so it is unreadable by the
application — including by admins through the app. Reading it requires the
service role or direct database access.

Images are **not** retained. The takedown destroys them like any other
deletion, and the log records only that there were *n* of them.

## 3. Lawful basis proposed

**UK GDPR Article 17(3)(e)** — the right to erasure does not apply where
processing is necessary for the establishment, exercise or defence of legal
claims.

The claims contemplated are real and specific to a platform of this kind:

- A member appeals a removal, months later, and we must show what was removed
  and why. Without the snapshot, "we removed a post for reason X" is close to
  worthless — and an appeal is the *only* time this table is ever read.
- A third party complains that we hosted defamatory, harassing or illegal
  material. We must be able to show it was removed, when, and on what grounds.
- Ofcom, under the Online Safety Act, asks how the service handled illegal
  content. Record-keeping is an express duty, not an optional practice.
- A member alleges the platform moderated them unfairly or discriminatorily.
  The record is as much the member's protection as ours.

Retention is bounded at **12 months**, enforced by `purge_moderation_records()`
on a nightly cron. `legal_hold` allows one record to outlive the window when a
claim is actually live, so the purge never has to be disabled for everybody in
order to preserve one row.

## 4. Why there is no foreign key

`author_id` is stored as a bare UUID rather than a reference to `auth.users`.

This is deliberate and it is the crux of the decision. If it cascaded, a member
could destroy the record of their own moderation by deleting their account —
and the case this record exists for is precisely the one where that member has
a reason to want it gone.

The codebase already sets this precedent: `admin_actions.target_id` is
FK-free for the same reason, so that audit rows survive the deletion of what
they describe.

## 5. What this costs the data subject, honestly

The argument against should be stated as strongly as the argument for.

- **The erasure is not complete.** A member who asks to be forgotten is not
  entirely forgotten. Their name is gone; their email address, one post, and
  the fact they were moderated are not.
- **It is retained without consent** and cannot be objected away, because
  17(3)(e) is an exemption rather than a balancing test.
- **`body_snapshot` retains content we told them was deleted.** This is the
  sharpest point. The post is gone from the site, the images are destroyed,
  but the words persist in a table for up to a year.

Mitigations already implemented: the 12-month ceiling is enforced by code, not
policy; the table is unreadable by the application; the takedown email tells the
author a record is kept for 12 months, so it is not a surprise; and the log is
written **only** for admin takedowns, never for a member's own deletion or for
routine expiry.

## 6. Alternatives considered

| Option | Why not |
|---|---|
| Delete the log on account deletion | Makes the record destroyable by the person it is about, at exactly the moment it matters |
| Keep the row, drop `body_snapshot` | An appeal cannot be answered without knowing what was actually removed |
| Pseudonymise `author_id` | A one-way hash we can still match against is not anonymisation; a hash we cannot match is the same as deleting the row |
| Retain 6 years (limitation period) | Disproportionate. 12 months covers appeals and regulatory questions; longer is hoarding |
| Retain 3 months | Shorter than a plausible complaint-to-escalation cycle, and shorter than Ofcom might expect |

## 7. Sign-off

⚠ **CONFIRM — required before the Community feature is enabled in production.**

| | |
|---|---|
| **Decision** | ☐ Approved as written ☐ Approved with amendments ☐ Rejected |
| **Approved by** | ______________________ (director, IC Founders Ltd) |
| **Date** | ______________________ |
| **Imperial DPO reviewed** | ☐ Yes ☐ Not required — date: ____________ |
| **Amendments** | |

If rejected, the technical change is small and contained: add
`references auth.users(id) on delete cascade` to `post_moderation_log.author_id`
in a new migration. The table then disappears with the account. Everything else
in the Community feature is unaffected.

## 8. Where this is implemented

| | |
|---|---|
| Table and comments | `supabase/migrations/20260829000001_community_posts.sql` §6 |
| Written by | `admin_delete_post()` in `…000002_community_posts_rpcs.sql` |
| Purge | `purge_moderation_records()` in `…000003_community_posts_crons.sql` |
| Author notified | `renderPostTakedownEmail()` in `frontend/src/lib/email.ts` |
| Asserted by | `supabase/tests/rls_smoke.sql` §31d, §31f, §31h |
| Verified in prod by | `supabase/checks/community_posts_postdeploy.sql` checks 18, 20 |

Related: [02 ROPA](./02-ropa.md) · [07 DPIA Screening](./07-dpia-screening.md) ·
[09 OSA Risk Assessment](./09-osa-illegal-content-risk-assessment.md)

# 02 · Record of Processing Activities (ROPA)

Prepared under **Article 30, UK GDPR**. DRAFT for Imperial DPO review.

- **Data Controller:** ⚠ CONFIRM — Imperial College London (via the Imperial Entrepreneurs
  society) *or* the society as controller under Imperial oversight. The DPO must determine the
  controller/processor relationship.
- **Information Asset Owner (IAO):** ⚠ CONFIRM — [staff sponsor / Union officer]
- **Information Asset Administrator (IAA):** ⚠ CONFIRM — [project owner running operations]
- **Categories of data subject:** Imperial students and verified Imperial alumni who register;
  individuals who contact the platform via the contact/appeals forms.
- **Special-category data:** None collected by design (Art. 9 not engaged).
- **Automated decision-making / profiling (Art. 22):** None.

> **Lawful basis** below is a *suggested* mapping for the DPO to confirm. For a voluntary
> membership community the realistic candidates are **performance of a contract / service**
> (Art. 6(1)(b)) for account and core features, and **legitimate interests** (Art. 6(1)(f))
> for security and cookieless analytics. Imperial's DPO decides the final basis.

---

## Processing activities

### A. Account creation & authentication
| Field | Detail |
|-------|--------|
| **Data** | Email address, auth provider, sign-in timestamps; first name & surname |
| **Purpose** | Create and secure a member account; verify Imperial affiliation |
| **Suggested basis** | Contract / performance of a service (Art. 6(1)(b)) |
| **Recipients (processors)** | Supabase (store + auth); Supabase Auth SMTP (magic-link/confirmation email) |
| **Retention** | For the life of the account; erased immediately on user-initiated deletion (`delete_my_account`). **Proposed (not yet automated):** inactivity-based deletion after a defined dormancy period — see note below |
| **Location** | Supabase (⚠ confirm region) |

### B. Member profile & directory
| Field | Detail |
|-------|--------|
| **Data** | First/last name, optional LinkedIn/GitHub/portfolio URLs, graduation year, short bio, "what I'm working on", self-selected interests & expertise |
| **Purpose** | Display the member in the community directory; enable relevant introductions |
| **Suggested basis** | Contract / legitimate interests; optional fields are user-supplied |
| **Recipients** | Supabase; visible to other approved members in-app |
| **Retention** | For the life of the account; erased on account deletion |
| **Location** | Supabase (⚠ confirm region) |

### C. Listings (opportunities / events / VC-grants)
| Field | Detail |
|-------|--------|
| **Data** | Listing content + a contact email; poster identity (`posted_by`) |
| **Purpose** | Let members publish and discover opportunities, events and funding |
| **Suggested basis** | Contract / legitimate interests |
| **Recipients** | Supabase; published listings visible to approved members; admins during review |
| **Retention** | **Rejected** listings auto-purged **2 days** after review; **expired** listings removed by daily cron; otherwise until the poster deletes them or their account |
| **Location** | Supabase (⚠ confirm region) |

### D. Transactional email
| Field | Detail |
|-------|--------|
| **Data** | Recipient email address + message body (acceptance, rejection, contact reply, account-removal) |
| **Purpose** | Operational communication tied to membership and submissions |
| **Suggested basis** | Contract / legitimate interests |
| **Recipients** | Resend (send); recipient names are HTML-escaped, never in headers |
| **Retention** | Queued rows in `outbound_email` are transient (drained every 5 min then marked sent); delivery logs per Resend's retention |
| **Location** | Supabase (queue) → Resend (EU, ⚠ confirm) |

### E. Contact & appeals inbox
| Field | Detail |
|-------|--------|
| **Data** | Submitter email, subject, free-text message |
| **Purpose** | Respond to enquiries and membership appeals |
| **Suggested basis** | Legitimate interests (handling enquiries) |
| **Recipients** | Resend (confirmation/ticket email); Cloudflare email routing → monitored inbox |
| **Retention** | ⚠ POLICY NEEDED — recommend "archived on resolution, purged at end of the following academic year unless needed for an ongoing dispute" (consistent with the DART draft). Not currently automated. |
| **Location** | Resend / Cloudflare / inbox provider |

### F. Abuse prevention (rate limiting & bot-check)
| Field | Detail |
|-------|--------|
| **Data** | Short-lived counters keyed to user-id / IP; Cloudflare Turnstile token |
| **Purpose** | Prevent spam, brute force and automated abuse |
| **Suggested basis** | Legitimate interests (security) |
| **Recipients** | Upstash Redis (counters); Cloudflare (Turnstile) |
| **Retention** | Counters expire within the sliding window (minutes–1 hour); no profile data stored |
| **Location** | Upstash EU (⚠ confirm) / Cloudflare global edge |

### G. Error monitoring
| Field | Detail |
|-------|--------|
| **Data** | Error stack traces; may incidentally include a user-id |
| **Purpose** | Detect and fix production faults; security incident detection |
| **Suggested basis** | Legitimate interests |
| **Recipients** | Sentry (errors only — no performance tracing, no session replay, no PII replay) |
| **Retention** | Per Sentry's default error-event retention |
| **Location** | Sentry EU via DSN (⚠ confirm org region) |

### H. Product analytics
| Field | Detail |
|-------|--------|
| **Data** | Page-view / page-leave events tied to a Supabase user-id; IP seen at network level |
| **Purpose** | Understand feature usage to improve the platform |
| **Suggested basis** | Legitimate interests (cookieless, no cross-site tracking) |
| **Recipients** | PostHog |
| **Notes** | **Cookieless** — `persistence: "memory"`, no cookies, no localStorage device id; autocapture off; session recording disabled |
| **Location** | PostHog EU (`eu.i.posthog.com`) |

### I. Admin audit log
| Field | Detail |
|-------|--------|
| **Data** | Which admin approved/rejected which item, and when |
| **Purpose** | Accountability and operational audit |
| **Suggested basis** | Legitimate interests |
| **Recipients** | Supabase only (admin-readable) |
| **Retention** | Retained as an audit record; admin's own authored actions removed if that admin deletes their account |
| **Location** | Supabase (⚠ confirm region) |

### J. Community posts (member-to-member feed)
| Field | Detail |
|-------|--------|
| **Data** | Post title and body written by the member; 0–2 attached images and the alt text describing them; author identity |
| **Purpose** | Operating the member-to-member Community feed |
| **Suggested basis** | Performance of contract (the membership service), supported by consent at the point of posting |
| **Recipients** | Supabase (post text); Microsoft Azure UK South (images only) |
| **Retention** | **7 days from publication**, enforced by `purge_expired_posts()` hourly. Sooner on member request (self-delete), on admin takedown, on ban, or on account deletion |
| **Location** | Supabase (EU/London) + Azure Blob Storage (UK South), private container, read only via short-expiry SAS |

Images are re-encoded on upload and all embedded metadata is discarded, including EXIF GPS
coordinates written by phone cameras. The original file is never stored.

### K. Post reports (complaints mechanism)
| Field | Detail |
|-------|--------|
| **Data** | Reporter identity, the post reported (title snapshotted so it survives removal), category, free-text reason, outcome and any note |
| **Purpose** | Operating a complaints and illegal-content reporting route, and evidencing that reports were acted on |
| **Suggested basis** | Legitimate interests (member safety, platform integrity), and compliance with a legal obligation where the report concerns illegal content |
| **Recipients** | Supabase only (admin-readable via RPC; the table itself is deny-all) |
| **Retention** | **12 months** from creation, via `purge_moderation_records()` daily |
| **Location** | Supabase |

The reporter is never disclosed to the author of the reported post.

### L. Post moderation log (takedown record)
| Field | Detail |
|-------|--------|
| **Data** | Snapshot of the removed post's title and body, author id and email at time of removal, acting admin, reason given, timestamps |
| **Purpose** | Explaining, reviewing, and if necessary defending a moderation decision that a member challenges |
| **Suggested basis** | Legitimate interests; and Art. 17(3)(e) where retention is necessary for the establishment, exercise or defence of legal claims |
| **Recipients** | No application access at all — service role / direct SQL only |
| **Retention** | **12 months**, via `purge_moderation_records()` daily. A `legal_hold` flag exempts a single record while a dispute is live |
| **Location** | Supabase |

⚠ **This is the one record that deliberately survives account deletion.** `author_id` carries no
foreign key precisely so that a member cannot erase the record of their own moderation by closing
their account — the record exists for the case where that matters. The member is told this in
Privacy §8 and Terms §6. **This design decision should be confirmed with the DPO before launch.**

---

## Retention summary (as actually implemented in code)

| Item | Retention | Mechanism |
|------|-----------|-----------|
| Rejected listings | 2 days after review | `purge_rejected_listings()` daily cron (02:30) |
| Expired opportunities / events / VC-grants | Removed once expired | Three daily expire crons (02:00 / 02:05 / 02:10) |
| Outbound email queue | Transient | Drained every 5 min |
| Community posts + attached images | 7 days after publication | `purge_expired_posts()` hourly (:15) |
| Post likes | Cascade-deletes with the post; no independent retention | `on delete cascade` from `posts` |
| Abandoned image uploads | 24 hours | `purge_stale_upload_tickets()` hourly (:25) |
| Image bytes in Azure Blob | Follows the post; queued on delete | `blob_deletion_queue` → drained every 5 min; 30-day account lifecycle rule as backstop |
| Post reports | 12 months | `purge_moderation_records()` daily (02:35) |
| Post moderation log (takedowns) | 12 months, unless `legal_hold` | `purge_moderation_records()` daily (02:35) |
| Account & all user-owned data | Immediate on request | `delete_my_account()` (user-initiated) |
| Contact/appeals messages | ⚠ Policy to be set (proposed: end of following academic year) | Manual / not yet automated |
| Inactive accounts | ⚠ **Proposed, not implemented** (DART draft's "24 months" is aspirational) | Would require a new cron |

**Data-subject rights:** account holders can edit their profile in-app and erase their entire
account (and all owned listings/joins) themselves via Settings → Delete account. This operationally
supports the rights of rectification and erasure. Access/portability requests would currently be
handled manually by export from Supabase — a documented manual procedure should be agreed with the DPO.

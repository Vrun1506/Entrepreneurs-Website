# DPIA screening — Community posts

**Controller:** IC Founders Ltd (Companies House 17171277)
**Assessed:** 29 August 2026
**Feature:** the Community feed — member-written posts with optional images, published without
prior review, deleted automatically after 7 days.
**Outcome:** a full DPIA is **not** required. Reasoning below.

The value of this document is that the assessment was made and recorded, not the conclusion it
reached. UK GDPR Art. 5(2) makes us accountable for demonstrating compliance, and "we considered
it, and here is why not" is a complete answer where "we never thought about it" is not. Re-run
this screening if any of the assumptions in the last section stop holding.

---

## Art. 35(3) — the mandatory triggers

| Trigger | Applies? | Why |
|---|---|---|
| Systematic and extensive automated evaluation, profiling, or automated decision-making with legal or similarly significant effects | **No** | There is no ranking, scoring, recommendation, or profiling anywhere in the feature. Posts are ordered strictly reverse-chronologically. No decision about a person is made automatically — an admin takedown is a human decision, recorded with the acting admin's identity. |
| Large-scale processing of special category or criminal-offence data | **No** | Special category data is not collected anywhere on the platform (Privacy §2). Members could in principle write such data into a post, but that is incidental content, not processing we design for or act on. |
| Systematic monitoring of a publicly accessible area on a large scale | **No** | The feed is behind authentication and restricted to approved members. It is `noindex`, and `robots.txt` disallows it. It is not a publicly accessible area, and nothing monitors anyone. |

None of the three mandatory triggers is met.

## ICO screening criteria

The ICO's higher-risk list was worked through as well; the criteria that come closest:

- **Processing that could result in denial of service or a discriminatory effect.** A takedown
  removes content and, in the ban case, access. This is a human decision with a mandatory written
  reason, an email to the affected member, and an appeals route (`appeals@imperialentrepreneurs.com`).
  A moderation record is retained for 12 months precisely so a challenge can be reviewed against
  evidence rather than memory.
- **Combining datasets.** Nothing is combined. Post data is not joined to analytics, and the feed
  is excluded from the response cache.
- **Vulnerable data subjects.** Members are Imperial students and alumni aged 18+ (Terms §2).
  There is no children's data, and no employer/employee power imbalance.
- **Innovative technology.** Nothing novel: a text feed with image attachments. No AI, no
  biometrics, no inference. The image pipeline strips metadata rather than extracting it.
- **Scale.** ~2,000 members, with a 7-day retention window. Not large scale on any reading.

## Risks identified, and what mitigates them

These were identified during design and are already implemented; they are recorded here because
the mitigations are the reason the residual risk is low, not because the risk was theoretical.

| Risk | Mitigation |
|---|---|
| A member unknowingly publishes their home location via photo EXIF | Every upload is decoded and re-encoded; EXIF, including GPS, is discarded and the original file is never stored (`server/app/images.py`) |
| Member content leaks beyond the membership | Private Azure container, `--allow-blob-public-access false`, reads only via short-expiry user-delegation SAS; feed is `noindex` and approved-members-only at the RLS layer |
| "Deleted" content is not actually deleted | Hard delete throughout — no soft-delete flag. A database trigger on `post_images` queues the blob bytes for destruction on *every* deletion path; Azure blob soft-delete and versioning are explicitly disabled so nothing is silently retained |
| Illegal or abusive content reaches members | Report control on every post, an admin queue that is reviewed and answered, immediate takedown with a mandatory reason, and a kill switch that stops all posting via one config change |
| Unbounded retention creeping in | Both windows are stored as data (`expires_at`, `purge_after`), enforced by cron, and stated in the privacy policy. `legal_hold` lets one record outlive the window without disabling the purge for everyone |
| Retention of a moderation record after an erasure request | Bounded to 12 months, minimised to what a challenge would need, disclosed in Privacy §8 and Terms §6. **See the open point below.** |

## Open point for the DPO

The `post_moderation_log` deliberately survives account deletion: `author_id` carries no foreign
key, so a member cannot erase the record of their own moderation by closing their account. The
basis relied on is Art. 17(3)(e) — establishment, exercise or defence of legal claims — bounded to
12 months and disclosed to members in both legal pages.

This is a defensible position but it is a legal judgement rather than an engineering one, and it
should be confirmed by whoever advises IC Founders Ltd before launch. If the advice is that the
record must not survive erasure, the change is small: add the foreign key and let it cascade.

## Related duties

Separate from data protection, the feed is a user-to-user service and engages the UK Online Safety
Act's illegal-content duties. Reporting, complaints handling and takedown are implemented; the
written risk assessment those duties require is **not** part of this document and still needs to be
produced.

## Re-run this screening if

- ranking, recommendation, or any automated scoring of posts is introduced;
- the feed becomes visible without authentication, or is indexed;
- retention is extended materially beyond 7 days;
- private messaging, comments, or any non-public interaction is added;
- membership grows by an order of magnitude;
- automated content classification (including any AI moderation) is introduced.

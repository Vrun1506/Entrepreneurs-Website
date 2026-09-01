# DPIA screening — Community posts, and post-approval intake (CV, photo, skills)

## Feature: post-approval intake — CV upload, deterministic skill matching, profile photo

**Controller:** IC Founders Ltd (Companies House 17171277)
**Assessed:** 1 September 2026
**Feature:** the `/intake` flow a member completes after admission — a profile photo (optional,
cropped client-side before upload), a CV upload (optional, PDF/DOCX), and a closed-taxonomy skill
picker pre-filled with deterministic string matches against the CV's extracted text.
**Outcome:** a full DPIA is **not** required. Reasoning below. **This conclusion should be
re-examined if the deterministic matcher is ever replaced by an LLM** — see
`cv-matchmaker-spec.md`'s planned successor, which is explicitly out of scope for what is screened
here.

### Art. 35(3) — the mandatory triggers

| Trigger | Applies? | Why |
|---|---|---|
| Systematic and extensive automated evaluation, profiling, or automated decision-making with legal or similarly significant effects | **No** | The matcher is a fixed string comparison against a ~180-entry controlled vocabulary — not inference, not scoring, not ranking. It produces suggestions a member must actively confirm; nothing is added to a profile, and no decision about a person is made, without that action. |
| Large-scale processing of special category or criminal-offence data | **Considered, not met.** A CV routinely carries data from which health, ethnicity, religion or age are *inferable* — this is exactly why the feature gets its own screening rather than folding into the community-posts one. But nothing here infers or acts on those categories: the only processing is a literal substring match against a skills list, and the extracted text is discarded within the same request, never stored, never reviewed by a human as text. |
| Systematic monitoring of a publicly accessible area on a large scale | **No** | Not applicable — this is a member uploading their own document to their own account. |

None of the three mandatory triggers is met.

### ICO screening criteria

- **Innovative technology / new use of technology.** The closest-fitting criterion. Extracting text
  from an uploaded document and matching it against a list is not novel, but doing so from a CV
  specifically invites the "could this become profiling" question. **Resolved by design**: the
  matcher can only ever return one of ~180 fixed skill ids, never freeform text, never a score,
  and never anything the CV's author didn't already choose to write. There is no model, no
  training, no inference step.
- **Vulnerable data subjects.** Same population as the rest of the platform — Imperial students
  and alumni, 18+. No change.
- **Special category data risk.** Covered above. The mitigation is architectural, not procedural:
  extracted text is held in memory for the one request and never written anywhere (see ROPA item
  O), so there is nothing to later mine, re-purpose, or breach.
- **Scale.** Bounded to the size of the membership; one CV per member, no version history.

### Risks identified, and what mitigates them

| Risk | Mitigation |
|---|---|
| CV text (potentially revealing health/ethnicity/religion/age) is retained and later repurposed | Not retained at all — extracted, matched, discarded within the same server action; never logged, never sent to a third party, never rendered back to any user (`lib/cv/extractText.ts`, `lib/cv/matchSkills.ts`) |
| A suggested skill is added to a profile without the member's knowledge | Every suggestion is a chip the member must tap to add — nothing is auto-applied, and the UI marks suggestions as distinct from confirmed skills |
| XXE / SSRF via a crafted DOCX | Verified directly against the actual parser (`mammoth`): a hand-built XXE-payload DOCX throws rather than resolving the external entity. No local-file-read or SSRF path exists |
| A macro-enabled `.docm` disguised as `.docx` | Rejected at the gateway by presence of `word/vbaProject.bin` in the zip, in addition to the `word/document.xml` check |
| Admin access to a member's CV is unaccountable | Permitted, but never silent — every admin view writes an `admin_actions` row (`action='view_cv'`), disclosed in ROPA item N |
| PDF embedded JavaScript reaches another member | It cannot: the file is served `Content-Disposition: attachment` from a separate origin (`blob.core.windows.net`), so it is inert unless the CV's own owner or an admin chooses to download and open it in a desktop reader |
| A member's face is treated as biometric data | It is not processed for unique identification anywhere — only displayed — so Art. 9 is not engaged (recorded explicitly in ROPA item M) |

### Open point for the DPO

None specific to this feature beyond the standing controller/IAO/IAA confirmations already open at
the top of `02-ropa.md`. The one design decision worth the DPO's attention is **PDF embedded
JavaScript is accepted, not stripped** (ROPA item N) — a deliberate trade-off (stripping would
require re-encoding, which breaks the "re-runnable from original bytes" property the matcher
depends on) rather than an oversight, but it is a judgement call about acceptable residual risk that
should be confirmed rather than assumed.

### Re-run this screening if

- the deterministic string matcher is replaced by an LLM, embeddings, or any model that infers
  rather than matches (`cv-matchmaker-spec.md`'s planned successor does exactly this);
- extracted CV text starts being retained, logged, or sent to a third party for any reason;
- suggestions are ever applied to a profile without an explicit per-suggestion confirmation;
- the skill taxonomy stops being a fixed, curated list (e.g. free-text skills reintroduced);
- CV access broadens beyond the owner and admins, or admin access stops being logged.

---

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

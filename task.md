# Outstanding tasks

**As of 2026-08-27 (second pass).** `main` is at `eae85c2`. Working tree holds
the changes described in "Done this session" below, not yet committed.

Written to be picked up cold by a session with no memory of the conversation
that produced it, so each item carries why it matters and where to act.

---

## Done this session

| Item | Outcome |
|------|---------|
| 1.1 Email template | **Done** — pasted into Supabase by the owner |
| 1.2 Captcha toggle | **Done** — Attack Protection: enabled, Turnstile, secret set |
| 1.4 Email settings saved | **Done** — verified from the dashboard: secure email change ON, secure password change ON, require-current-password ON, min length 8, OTP 1800s / 6 digits. All match `config.toml` |
| 5.1 Duplicate-email oracle | **Fixed** — see below |
| 5.3 Branch cleanup | **Done** — bundled, verified, deleted |
| 6 Bulk-admin | **Fixed** — see below |
| Logo re-export | **Done** — see below |

### The bulk-admin fix

There were **two** `runBulk` functions. `app/admin/users/actions.ts` had a
batched one; `lib/admin/bulk.ts` — used by events, opportunities and VCs via
`bulkApproveListings` — still called the whole single-item action per id
(admin gate + RPC + cache drop + two revalidates each). A fifty-item listing
backlog was ~300 sequential round trips and could hit the function timeout
part-way, half-applying with nothing shown to the admin.

Now: one shared `runBulk` in `lib/admin/bulk.ts`, generic over the recipient
type, taking `cacheKeys` and `revalidate` paths so both callers use it. Auth
once, one RPC per item, one bulk email insert, one cache drop, one revalidate
per path. `sendListingRejectionEmail` was split into
`renderListingRejectionEmail` + send, matching how the acceptance and
profile-rejection emails were already structured.

**New coverage:** `e2e/admin.spec.ts` gained a listings bulk test (approve and
reject). The listing path had none — the member path was tested before its
refactor, the listing path was refactored without. Assertions go to the
database and to `outbound_email`, not to the toast, because the count in
"2 events updated." is rendered from a number the action returns and would
still print if only one row moved.

### The duplicate-email oracle (was 5.1)

Changing to an address that already has an account returned GoTrue's raw
422 `email_exists` — "A user with this email address has already been
registered". Any signed-in member could test addresses one at a time and
learn which were registered.

`EmailChangeForm` now swallows **that one error** and advances to the code
screen exactly as a free address does, matching `resetPasswordForEmail`,
which is deliberately anti-enumeration. Every other error still surfaces.
Nothing is lost by staying quiet: on this error GoTrue sends no mail and
writes no pending change, so the codes the screen asks for do not exist and
the change cannot complete.

Bench **A11** was rewritten to assert the new property — the screen reaches
the code step and contains no "already registered" text — instead of the old
"is refused".

### The logo re-export

One 4832×2540 / **1.5 MB** file was doing four jobs. The three on-page uses go
through `next/image` and get resized; **OG and JSON-LD are served raw**, so
every link preview pulled 1.5 MB — over the size several scrapers (WhatsApp,
iMessage) skip outright, losing the preview entirely.

| File | Size | Job |
|------|------|-----|
| `entrepreneurs-logo.png` | 2416×1270, **156 KB** (was 1.5 MB) | on-page source for `next/image` |
| `og-image.png` | 1200×630, **85 KB** | OG + Twitter card |
| `logo-square.png` | 512×512, **15 KB** | JSON-LD `Organization.logo` |

The on-page source is an exact half of the original, so the aspect ratio and
every rendered layout are unchanged; `mixBlendMode: "screen"` still knocks out
the starfield as before. Intrinsic `width`/`height` props updated in
`BrandLogo`, `Hero` and `not-found`.

**Open question for the owner:** the artwork carries the tagline "GO DO SHIT."
It is preserved as-is in `og-image.png` — that is a brand call, not a
technical one. Note where it now surfaces: every link preview in Slack,
WhatsApp, LinkedIn and **Microsoft Teams** (which Imperial runs), and it is
the image a Google brand-verification reviewer sees for the OAuth consent
screen (item 4.2). `logo-square.png` is the roundel alone, so the JSON-LD
logo slot does not carry it either way.

### Branch cleanup (was 5.3)

The old audit was stale — it claimed 15 local / 3 remote; there were **27
local and 24 remote**. Re-checked live against the current repo rather than
trusting the recorded result.

`git cherry` over-reports (squash merges are not patch-identical) and a
per-file comparison over-reports too (it flags anything `main` has since
touched). So each flagged branch's *distinctive deliverable* was checked
against `main` directly: the three `2026082[67]` migrations, `Europe/London`
in `dates.ts`, the account-keyed rate limiter, `RESEND_FROM` fail-loud (it
landed in `drain-email/route.ts`, not `email.ts`), URL filters / Pager /
FilterBar, and the email-change double confirm. All present.
`chore/rowcap-per-user-queries` was **superseded** — `reportIfCapped` is now
centralised in `lib/data/query.ts` and the per-user pages go through
`lib/data/*`.

Backup, taken before deleting anything and **verified by cloning it**:

    ~/Downloads/EntrepreneursWebsite-branch-backup/
      all-refs-2026-08-27.bundle   2.5 MB, all 53 refs, "records a complete history"
      manifest-2026-08-27.txt      <sha> <ref> for every branch
      README.md                    restore instructions

`main` is now the only branch, locally and on origin.

---

## 1 · Blocking — before real members arrive

### 1.3 Re-test sign-in and password change

**The one blocking item left.** Captcha is now live, and it gates the
session-minting endpoints (`/signup`, `/token`, `/recover`, `/otp`, `/resend`
— not `/user` or `/verify`). A secret/site-key mismatch breaks sign-in for
**everyone**, and the first report would come from a member. Needs an account
with a password; a Google-only account has no password identity and correctly
hides that card.

Note: if any production smoke test signs in, it will start failing now — that
is the test meeting a real captcha, not a broken sign-in.

---

## 2 · Legal — parked until the feature work lands

### 2.1 Add "former email addresses" to the privacy policy

`public.email_change_log` (migration `20260827000004`) retains PII the policy
does not list. A new data **category**, not a rewording.

- Controller: **IC Founders Ltd**, Companies House **17171277**
- Registered office: 71–75 Shelton St, London WC2H 9JQ
- Data-protection contact currently `contact@imperialentrepreneurs.com`

The table is `ON DELETE CASCADE` and readable only by `service_role` (RLS on,
no policies, grants revoked from `anon`/`authenticated`), so deleting an
account still deletes everything about them — load-bearing for the policy
claim, and covered by an E2E test.

Parked at the owner's direction: much of the policy will change once the
remaining features land, so it is written once at the end. **The deadline is
real members arriving, not feature completion** — the table is live in
production now and retains a former address the moment anyone changes their
email.

---

## 3 · Verification still owed

Production test bench:
<https://claude.ai/code/artifact/bb94c2fc-3e87-4b67-b107-eded5cfbdc77> — 44
checks, each paired with the shape of its failure.

### 3.1 Bench C1/C3/C4 — the password-reset round-trip

**The only bench row that could neither be automated nor ruled out.** Following
the recovery link reaches `/auth/callback`, the PKCE exchange succeeds (a
failure there redirects to `/login?error=…`; the observed landing was a clean
`/login`), and `/reset-password` then turns the visit away — so `getUser()` or
the `pw-recovery` marker did not survive the hop.

Ruled out already: the marker's `secure` flag is conditional on origin, so http
localhost is fine; and `additional_redirect_urls` had the wrong scheme *and*
host (`https://127.0.0.1:3000` against a server on `http://localhost:3000`),
now fixed in `config.toml`. Diagnosis recorded in `e2e/pipelines.spec.ts`.

Looks local-only, but that is **unproven**. Confirm by hand in production.
Queued directly after 1.3.

### 3.2 Bench A13 — codes expire after 30 minutes
Needs real elapsed time. Should match `otp_expiry = 1800`.

### 3.3 Bench B7 — sign out everywhere
Needs a second device signed in.

### 3.4 Bench F1 — mail lands in Outlook's inbox, not spam

**Highest-consequence unrun check.** Every Imperial student reads mail in
Microsoft 365. **Blocked:** the owner is not an Imperial member and has no
Imperial mailbox; someone with one will be asked to run it. Check Gmail *and*
an Outlook/Imperial address across the email-change, reset and approval mails.
Confirm the sender is the verified mail subdomain with no "via" or
unverified-sender warning.

### 3.5 "Require current password when updating" — permanently manual
On in the hosted project (confirmed 2026-08-27); Supabase CLI 2.105.0 has no
config key for it, so it cannot be reproduced locally. `PasswordChangeForm`
sends `current_password`, but manual testing is the only coverage. Not
closable — a tooling limitation.

---

## 4 · Longer-standing — scheduled for the end

- [ ] Sitemap → Google Search Console
- [ ] Google consent screen — brand verification, publish to production
      (see the tagline note under "The logo re-export")
- [ ] Lock the Vercel origin to Cloudflare IPs
- [ ] Alum signup round trip (bench D3)
- [ ] Contact form round trip (bench F5) — matters more than before, since the
      change-email template now points members at it

---

## 5 · Decisions outstanding

### 5.2 `CLAUDE.md` tracked in git
Kept in #51 — it is the project's graphify instructions and sits beside the
already-tracked `.claude/CLAUDE.md`. It arrived as a side effect of a
`git add -A`, not a decision. Say the word to ignore it instead.

---

## 6 · Next up

**Full frontend audit and redesign**, on a branch named `frontend-audit`, to
start once the PR for the work above has passed CI, been approved and merged
to `main`. Scope as given: audit the existing frontend, remove "AI slop"
(gradient soup, animation on everything), align the design with the logo, and
optionally add Three.js work — with the full frontend config set up properly.
Handle edge cases; do not mutate wildly. Skills to consult first:
`design-taste-frontend`, `impeccable`, and the `awesome-design-md` repository
(<https://github.com/VoltAgent/awesome-design-md>), which is to be installed
into the workspace.

---

## Standing rules that bit during this work

- **Always `pnpm build` in the same script as `pnpm exec playwright test`**,
  with env exported from `supabase status -o env`. `next start` serves the last
  build and never rebuilds. `e2e/global-setup.ts` guards this, but treat it as
  the backstop, not the process.
- **`.env.local` points at PRODUCTION.** Never source it for E2E or scripts.
- **Supabase CLI is pinned to 2.105.0.** 2.106.0 broke local default table
  grants. `npx supabase@2.105.0` locally; `supabase/setup-cli@v2` with
  `version: 2.105.0` in CI.
- **Delete members through `/admin/members`, never the Supabase console.**
  `admin_actions.admin_id` and `opportunities`/`events`/`vcs_grants.posted_by`
  are `RESTRICT`; the dashboard doesn't clear them and reports only "Database
  error deleting user". Anyone who has ever taken an admin action will always
  fail there.
- **`frontend/` uses pnpm.** Never npm, never `npm audit fix`.
- **Auth settings live in two places** — the Supabase dashboard and
  `supabase/config.toml` — and only one is in git. When something works
  locally and fails in production, diff these first.
- **Re-derive branch audits; never trust a recorded one.** The audit in the
  previous version of this file was wrong by 12 local and 21 remote branches.

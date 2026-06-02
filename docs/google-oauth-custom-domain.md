# Google sign-in — make the consent screen trustworthy & branded

## Status / decision (2026-06-02)

**Decision: free brand verification, NOT the paid Supabase custom domain.** The paid route only
cleans up the transient redirect-URL flash; free verification fixes everything users actually read.

**Brand verification is deferred until the Privacy/Terms pages are finalised** — that submit step is
where Google crawls `/privacy` + `/terms`, and Terms still shows a "placeholder — finalise with
ICU/legal" banner. Remove that banner before submitting for verification.

**Safe to do now (no Google review triggered) — see Steps 4, 5, 6 below:**
- [ ] Publish the OAuth app to production (Audience → External → Publish → Push to production) —
      unlocks the alumni Google sign-in flow.
- [ ] Trim Data Access scopes to `userinfo.email` / `userinfo.profile` / `openid` only.
- [ ] Confirm redirect URI `https://jnoinwpgqkqgrijbxbvk.supabase.co/auth/v1/callback` (don't touch
      the Client ID/Secret).
- [ ] (Optional lead-time) verify `imperialentrepreneurs.com` in Google Search Console.

**Deferred until legal is sorted:**
- [ ] Upload logo + Submit for verification (Steps 2, 7). The logo upload is what starts the queue,
      so leave it until the legal pages are final. Until then the screen cosmetically shows
      `…supabase.co` — functionally identical to today.

**Note:** the "User support email" field can only be `REDACTED-ADMIN-EMAIL` for now (Google
restricts it to the signed-in account or a Group it manages; the `contact@` Cloudflare forward isn't
a Google account, so it can't be selected). It's low-visibility — acceptable.

---

## What you're seeing & why

When an alum signs in with Google, the account chooser reads:

> **Choose an account** — to continue to **jnoinwpgqkqgrijbxbvk.supabase.co**

That host is your Supabase project ref. Google shows the **raw redirect domain** whenever the OAuth
app's **brand has not been verified**. Once you brand + verify the consent screen, that line becomes
**"to continue to Imperial Entrepreneurs"** with your logo — which is what makes it look legit
instead of phishy. **This is free** (no Supabase paid add-on, no code change). See Appendix B for the
paid custom-domain option, which you almost certainly don't need.

Two separate things to get right:
1. **No scary "Google hasn't verified this app" warning** → keep scopes minimal + publish to
   production. (Easy.)
2. **Your name + logo show instead of the domain** → submit for **brand verification**. (2–3 business
   days, free.)

---

## Before you start

- You need the **same Google Cloud project** that holds the OAuth client you pasted into Supabase
  (Supabase Dashboard → Authentication → Providers → Google: that Client ID / Secret came from this
  project). Edit that project — don't make a new one.
- Have ready: a **square logo** (PNG, ≥120×120, on a solid/transparent background — your existing
  Foundry / Imperial Entrepreneurs mark), and a **support email** you actually monitor (e.g.
  `contact@imperialentrepreneurs.com`).
- Your production site URL: `https://imperialentrepreneurs.com`.
- Your Supabase callback URL: `https://jnoinwpgqkqgrijbxbvk.supabase.co/auth/v1/callback`.

---

## Step 1 — Open the Google Auth Platform

1. Go to **https://console.cloud.google.com**.
2. Top bar: click the **project picker** and select the project that has your Google OAuth client.
3. Left menu (hamburger ☰) → **APIs & Services** → **OAuth consent screen**.
   - If you land on the newer **Google Auth Platform** screen, you'll see tabs down the left:
     **Overview · Branding · Audience · Clients · Data Access · Verification Center**. Use those.

---

## Step 2 — Branding (the name, logo & links users see)

Click **Branding** (left tab).

1. **App name** → `Imperial Entrepreneurs`
   - Don't use "Google", "Foundry by Google", or anything that mimics another brand — Google rejects
     those during verification.
2. **User support email** → choose `contact@imperialentrepreneurs.com` (or your monitored inbox).
3. **App logo** → **Upload** your square logo.
   - ⚠️ Uploading a logo is the trigger that puts the app into the **brand-verification** queue. Good
     — that's exactly what you want.
4. **App domain** section:
   - **Application home page** → `https://imperialentrepreneurs.com`
   - **Application privacy policy link** → `https://imperialentrepreneurs.com/privacy`
   - **Application terms of service link** → `https://imperialentrepreneurs.com/terms`
   (You already have `/privacy` and `/terms` pages live — these links make the screen look complete
   and are required for verification.)
5. **Authorized domains** → **Add domain** → `imperialentrepreneurs.com`
   - (Just the root domain, no `https://`, no `www`.)
6. **Developer contact information** → your email address (Google uses this to reach you about the
   app; not shown to users).
7. Click **Save**.

---

## Step 3 — Verify you own the domain (required for Step 2.5 to stick)

Google won't let `imperialentrepreneurs.com` sit in "Authorized domains" unless you've proven you own
it. If it complains, do this once:

1. Go to **https://search.google.com/search-console**.
2. **Add property** → choose **Domain** → enter `imperialentrepreneurs.com`.
3. Google gives you a **TXT record**. Add it at **Cloudflare** (DNS → Records → Add record → type
   `TXT`, name `@`, value = the string Google gave). Save.
4. Back in Search Console, click **Verify** (DNS can take a few minutes to propagate).
   - Use the **same Google account** that owns the Cloud project, or the verification won't carry
     over to the consent screen.

---

## Step 4 — Audience (publish to production, allow external users)

Click **Audience** (left tab).

1. **User type** must be **External** — your alumni sign in with personal Gmail, which is outside any
   org, so Internal won't work.
2. **Publishing status**:
   - If it says **Testing**, click **Publish app** → confirm **Push to production**.
   - Why: in Testing, only the ≤100 emails you manually add as "test users" can sign in, and branding
     is suppressed. Production lifts both.
3. (Optional) You can ignore "Test users" once published.

---

## Step 5 — Data Access (keep scopes minimal = no scary warning, light verification)

Click **Data Access** (left tab).

1. Under **Scopes**, you should only have the **non-sensitive** basics:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
2. If anything **sensitive** or **restricted** is listed (e.g. Drive, Gmail, Calendar scopes) and you
   don't use it, **remove it**. Supabase social login only needs email/profile/openid.
   - This matters: **non-sensitive scopes don't trigger Google's heavy security assessment**, and a
     published app with only these scopes does **not** show users the "Google hasn't verified this
     app" interstitial. Adding a sensitive scope is what makes that warning (and a weeks-long review)
     appear.
3. **Save** if you changed anything.

---

## Step 6 — Clients (sanity-check the redirect URIs)

Click **Clients** (left tab) → open your **OAuth 2.0 Client ID** (the Web application one tied to
Supabase).

1. **Authorized JavaScript origins** should include:
   - `https://imperialentrepreneurs.com`
   - `https://www.imperialentrepreneurs.com` (if you serve www)
2. **Authorized redirect URIs** must include exactly:
   - `https://jnoinwpgqkqgrijbxbvk.supabase.co/auth/v1/callback`
3. Don't change the Client ID/Secret — those are already wired into Supabase. **Save** only if you
   added a missing URI.

---

## Step 7 — Submit for brand verification

If uploading the logo (Step 2.3) didn't already start it:

1. Go to the **Verification Center** tab (or the banner Google shows on the Branding/Overview page)
   and click **Prepare for verification** / **Submit for verification**.
2. Confirm the details (app name, logo, domain, home/privacy/terms links, scopes).
3. Submit. Google emails you; **brand verification typically takes 2–3 business days**. Because you
   only use non-sensitive scopes, they usually won't ask for a demo video or a full security review —
   it's the lightweight brand check.

---

## What the user sees, before vs after

| | Before (now) | After verification |
|---|---|---|
| Account chooser | "to continue to **jnoinwpgqkqgrijbxbvk.supabase.co**" | "to continue to **Imperial Entrepreneurs**" |
| Logo | none | your logo |
| "Unverified app" warning | only if a sensitive scope is added | none (basic scopes) |
| Links | none | Privacy / Terms / home page shown |

While verification is pending, the screen still works — it just keeps showing the domain until Google
approves. Don't re-enter Testing mode in the meantime or branding resets.

---

## Trust checklist (so it reads "legit", not "phishing")

- ✅ App name = your real org name, not a lookalike.
- ✅ Logo uploaded and verified.
- ✅ Home / Privacy / Terms links point at `imperialentrepreneurs.com`.
- ✅ Authorized domain verified in Search Console.
- ✅ Only `email` / `profile` / `openid` scopes (no sensitive scopes → no warning, faster review).
- ✅ Published to production (External).
- ✅ Support email is monitored.

---

## Appendix A — quick "why is it still showing the domain?"

- App is still in **Testing** → publish it (Step 4).
- Logo not uploaded / verification not submitted → do Steps 2.3 + 7.
- Verification still pending → wait 2–3 business days.
- You edited branding with a **different Google account** than owns the project → use the project
  owner account.

## Appendix B — PAID alternative (Supabase Custom Domain) — usually unnecessary

This changes the actual redirect **URL** to `auth.imperialentrepreneurs.com` (not just the displayed
name). It needs a **paid Supabase plan** (Pro, ~$25/mo) **plus** the Custom Domain add-on (~$10/mo).
The free consent-screen branding above already fixes what users *see*, so only do this if you
specifically want auth served from your own hostname.

Steps if you ever want it: enable Custom Domains in Supabase → Project Settings → add
`auth.imperialentrepreneurs.com` (CNAME at Cloudflare, **DNS-only / grey cloud**) → in Google Cloud
add `https://auth.imperialentrepreneurs.com/auth/v1/callback` to Authorized redirect URIs → set
`NEXT_PUBLIC_SUPABASE_URL` (Vercel + `.env.local`) to the custom host → update Supabase Auth Site URL
/ Redirect URLs → test the alum Google flow before removing the old `…supabase.co` redirect URI.

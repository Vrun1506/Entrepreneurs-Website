# Pentest ⚪ INFO items — checklist

The 2026-06-03 pentest raised four informational items (no severity). None
block launch; this is what each one means and what to do. Status as of
2026-06-03.

---

## 1. Analytics inflation — ✅ already fixed in code

**Finding:** `record_listing_event` let any authenticated user insert unlimited
click events for any listing, so the per-listing "clicks" total a poster saw
could be inflated by a third party.

**Fix shipped:** migration `20260602000001_listing_stats_distinct_clicks.sql`
recreates `get_my_listing_stats` to count `count(distinct viewer_id)` instead of
`count(*)`. RLS smoke test 9 asserts it.

**Action for you:** none — just confirm the migration is applied (it's in the
batch below).

---

## 2. CSP `unsafe-inline` — ✅ already mitigated; optional hardening

**Finding:** the Content-Security-Policy `script-src` includes `'unsafe-inline'`.

**Why it's already fine:** the live CSP is **nonce-based + `'strict-dynamic'`**
(built per-request in `frontend/middleware.ts`). Per the CSP spec, when a browser
sees a nonce or `'strict-dynamic'`, it **ignores** `'unsafe-inline'`. The
`'unsafe-inline'` token is only there as a fallback for ancient browsers that
don't understand nonces — modern browsers never honour it. So inline-script
injection is already blocked on every current browser.

**Action for you:** none required. Optional, later: once you've confirmed nothing
breaks, you could drop the `'unsafe-inline'` fallback and tighten `style-src`.
Verify the header in prod:

```bash
curl -sI https://www.imperialentrepreneurs.com | grep -i content-security-policy
```

You should see a `nonce-…` value and `strict-dynamic`.

---

## 3. Blast radius (service-role key) — operational hardening

**Finding:** `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. If it leaks, the
whole database is exposed.

**What's already true:** the key is read server-side only (`lib/supabase/service.ts`,
`server-only` import), never prefixed `NEXT_PUBLIC_`, and the startup preflight
(`instrumentation.ts`) shouts if abuse-control env vars go missing.

**Action for you:**
1. In Vercel, confirm `SUPABASE_SERVICE_ROLE_KEY` is set on **Production/Preview
   server** scope only — never as a `NEXT_PUBLIC_` var. (Check: it must not
   appear in any client bundle. `grep -r SERVICE_ROLE frontend/.next` after a
   build should return nothing.)
2. Keep the key out of logs (we never log it).
3. Treat rotation as a documented manual task — see
   `tasks/key-rotation-runbook.md` (rotating it regenerates the JWT secret and
   invalidates sessions, so it's a planned maintenance event, not automated).
4. Supabase Dashboard → enable Postgres logs / log drains so an anomalous
   service-role query pattern is at least visible after the fact.

---

## 4. Supabase email confirmation — verify in dashboard

**Finding:** can't tell from code whether Supabase requires email verification on
signup; needs a dashboard check.

**Action for you (Supabase Dashboard):**
1. **Authentication → Providers → Email** → ensure **"Confirm email"** is **ON**.
   With it on, a new email/password (alum) signup can't be used until the address
   is verified. (Student signup is magic-link, which is inherently verified.)
2. **Authentication → URL Configuration**:
   - **Site URL** = `https://www.imperialentrepreneurs.com`
   - **Redirect URLs** = include `https://www.imperialentrepreneurs.com/auth/callback`
     (and your Vercel preview domain if you use one for testing).
3. **Authentication → Rate Limits** → keep the default email send + verification
   limits on (defence against signup-email flooding).

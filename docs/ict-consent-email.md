# Draft email to Imperial ICT

**Suggested recipients:**
- Primary: Imperial ICT service desk (`service.desk@imperial.ac.uk`) — they'll route to the Entra/identity team
- CC: ICU Societies Office, faculty sponsor (if applicable)

**Suggested subject line:**
`Admin consent request — Foundry, an Imperial student-built community platform`

---

Dear Imperial ICT Identity Team,

I am **[PRESIDENT NAME]**, President of **[SOCIETY NAME]**, a registered Imperial College Union society. We have built **Foundry**, a private community platform for Imperial students interested in entrepreneurship, and we would like to enable Imperial students to sign in using their Imperial Microsoft account. To do this, we need a short administrative action from your team.

## What we are asking for

We have registered a multi-tenant Microsoft Entra ID application that requests only the standard delegated scopes `openid`, `profile`, `email`, and Microsoft Graph `User.Read`. Because the publisher is not currently Microsoft-verified, Imperial students cannot self-consent at sign-in. We would like Imperial's tenant to grant admin consent so students can sign in seamlessly.

**Application details:**

| Field | Value |
| --- | --- |
| Display name | Foundry Supabase Auth |
| Application (client) ID | `[CLIENT_ID]` |
| Publisher tenant | `[OUR_TENANT_ID]` |
| Redirect URI | `https://jnoinwpgqkqgrijbxbvk.supabase.co/auth/v1/callback` |
| Requested delegated scopes | `openid`, `profile`, `email`, `User.Read` |
| App-only / write permissions | **None** |

**To grant consent:** in Imperial's Entra portal → *Enterprise Applications* → search "Foundry Supabase Auth" → *Permissions* → "Grant admin consent for Imperial College London." (The app will appear in Enterprise Applications after the first Imperial user attempts to sign in.)

## Why this matters and what it does not change

Access to Foundry is already restricted to verified Imperial email addresses (`@imperial.ac.uk`, `@ic.ac.uk`) at the database level. Microsoft sign-in is purely a usability improvement — it lets students use the Imperial account they already have rather than creating yet another password. Granting consent does not give Foundry any data beyond what a user voluntarily enters: name, email, and profile fields.

## Data, hosting, and governance

A one-page overview is attached. In short:

- Hosted on Supabase (EU West 2, London) and Vercel (EU). All user data remains in UK/EU jurisdictions.
- No special-category data is collected. Lawful basis: consent.
- Users can delete their account and all associated data in-app.
- Society-sponsored: [SOCIETY NAME], supported by [ICU SOCIETIES CONTACT / FACULTY SPONSOR].

## Sponsorship

This request is being made through [SOCIETY NAME] with the support of [ICU SOCIETIES OFFICE CONTACT / RELEVANT FACULTY SPONSOR].

## We are happy to

- Provide a fuller Data Protection Impact Assessment
- Demo the platform to your team
- Meet in person or on Teams to walk through the architecture
- Adjust requested scopes if any are considered excessive

Thank you for your time. I am happy to answer any questions or provide additional documentation.

Best regards,

**[PRESIDENT NAME]**
President, [SOCIETY NAME]
[EMAIL]
[PHONE]

---

## Placeholders to fill before sending

- `[PRESIDENT NAME]` — society president's full name
- `[SOCIETY NAME]` — registered ICU society name (and registration reference if available)
- `[CLIENT_ID]` — paste from Azure portal → App registrations → Foundry Supabase Auth → Overview → "Application (client) ID"
- `[OUR_TENANT_ID]` — Azure portal → Overview → "Directory (tenant) ID" (this is *your* Default Directory, not Imperial's)
- `[EMAIL]`, `[PHONE]` — president's preferred contact details
- `[ICU SOCIETIES CONTACT / FACULTY SPONSOR]` — optional but materially improves credibility

## Tips before sending

- Attach `ict-consent-overview.md` (or a PDF export) to the email.
- If your society has an Imperial faculty advisor, CC them — institutional asks land better with internal sponsorship visible.
- If ICT pushes back, the fallback ask is narrower: rather than full admin consent, request that Foundry's app ID be added to Imperial's tenant consent policy allowlist. Same effect, lower-friction approval path.
- Don't promise launch dates in the first email — let ICT set the pace.

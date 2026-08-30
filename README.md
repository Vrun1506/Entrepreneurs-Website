# Foundry

The private community platform for Imperial Entrepreneurs. Members find
opportunities, events and funding, browse each other, and post to a
short-lived community feed. Everything behind the front page is
approved-members-only.

Live at [imperialentrepreneurs.com](https://www.imperialentrepreneurs.com).
Data controller: IC Founders Ltd (Companies House 17171277).

## Layout

```
frontend/      Next.js 16 app — the whole product. Deployed on Vercel.
supabase/      Migrations, RLS tests, post-deploy checks. The database is
               not a dumb store: authorisation lives in RLS policies and
               SECURITY DEFINER RPCs, not in application code.
server/        FastAPI upload gateway. Sanitises member images into Azure
               Blob. Holds no database connection by design.
infra/         Azure provisioning and deploy scripts for that gateway.
docs/          Compliance record — ROPA, DPIA screening, incident response.
```

Two things about `frontend/` that surprise people: the middleware entry is
`src/proxy.ts`, not `middleware.ts`, because that is what Next 16 names it;
and the package manager is **pnpm**, so `npm install` will produce a broken
tree and `npm audit fix` will fight the overrides in `pnpm-workspace.yaml`.

## Running it

```bash
cd frontend
pnpm install
pnpm dev
```

You need a Supabase project. Copy `.env.example` to `.env.local` and fill it
in — every secret in that template is blank on purpose, and the app fails
loudly rather than falling back to a default for anything required.

For anything touching the database, run against a local stack rather than
production:

```bash
pnpm exec supabase start --workdir ..
pnpm exec supabase db reset --workdir ..
```

## Tests

Four layers, and they check different things:

```bash
cd frontend
pnpm lint && pnpm typecheck && pnpm test      # unit — Vitest
pnpm build && pnpm exec playwright test       # E2E against a real build
cd ../server && ./venv/bin/python -m pytest   # the image sanitiser
```

```bash
# RLS and admission rules, against a local stack
psql "$DB_URL" -f supabase/tests/rls_smoke.sql
psql "$DB_URL" -f supabase/tests/admission_roles.sql
```

`rls_smoke.sql` is the one to read first if you are new here. It asserts who
can see and do what, in SQL, against a real database — including the things
that are true only because a policy is *absent*.

Always `pnpm build` in the same command as a Playwright run. Testing a build
you did not just make is how a suite passes against last week's code.

## Deploying

The app deploys itself: merge to `main` and Vercel builds it. Migrations are
`supabase db push`, followed by
`supabase/checks/community_posts_postdeploy.sql` to confirm the things the
migration was *for* are actually true — a grant that quietly came back or a
cron job that did not register raises nothing on apply.

The upload gateway is `infra/deploy.sh <vm-ip>`. See `infra/README.md`.

## Where the security actually lives

Worth knowing before changing anything:

- **`supabase/migrations/`** — RLS policies and `SECURITY DEFINER` RPCs. On
  this project `revoke ... from public` locks nothing, because Supabase's
  default privileges grant `anon` and `authenticated` directly; all three
  roles have to be named. `20260608000001` is the incident that taught us.
- **`server/app/images.py`** — everything reaching it is attacker-controlled
  and everything leaving it is served to the whole membership.
- **`frontend/src/lib/csp.ts`** — enforce-mode nonce CSP, built per request.
- **`frontend/src/lib/ratelimit.ts`** — note that `FAIL_CLOSED` is a list,
  not a default. A new bucket added without being named there fails *open*.

## Compliance

`docs/compliance/` is a real record, not decoration: ROPA, DPIA screening,
retention schedule, incident response plan. Retention windows are stored as
data (`expires_at`, `purge_after`) and enforced by `pg_cron`, so a period the
privacy policy quotes is one you can `SELECT`.

If you change what data is collected or how long it is kept, the ROPA and the
privacy page change in the same PR.

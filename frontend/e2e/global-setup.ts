import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { USERS, storageStatePath, type SeedUser } from "./fixtures";

// ════════════════════════════════════════════════════════════════════
// E2E global setup — runs once against the ephemeral Supabase before any
// spec. Seeds an approved student + an admin via the admin API (real
// passwords, since CI owns the local GoTrue), then mints each one's
// session into a Playwright storageState so the authed projects start
// logged in. No magic link needed.
// ════════════════════════════════════════════════════════════════════

export default async function globalSetup(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    throw new Error(
      "E2E global-setup: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
        "SUPABASE_SERVICE_ROLE_KEY must be set (CI exports these from `supabase status`).",
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hostname = new URL(url).hostname;

  for (const user of Object.values(USERS)) {
    await seedUser(admin, user);
    const session = await passwordSession(url, anon, user);
    const storageState = await sessionToStorageState(url, anon, session, hostname);
    const path = storageStatePath(user.role);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(storageState, null, 2));
  }
}

// Create the auth user (the new-user trigger inserts a pending_onboarding
// profile), then approve it as service_role (bypasses the protect-status
// trigger, exactly like the production service client). Admins also get an
// `admins` row.
async function seedUser(admin: SupabaseClient, user: SeedUser): Promise<string> {
  let userId: string;
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { first_name: user.firstName, surname: user.surname, role: "student" },
  });
  if (error) {
    const existing = await findUserId(admin, user.email);
    if (!existing) throw new Error(`createUser ${user.email}: ${error.message}`);
    userId = existing;
  } else {
    userId = data.user!.id;
  }

  const { error: pErr } = await admin
    .from("profiles")
    .update({ status: "approved", course: "MEng Computing", grad_year: 2027 })
    .eq("id", userId);
  if (pErr) throw new Error(`approve profile ${user.email}: ${pErr.message}`);

  if (user.isAdmin) {
    const { error: aErr } = await admin
      .from("admins")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
    if (aErr) throw new Error(`grant admin ${user.email}: ${aErr.message}`);
  }
  return userId;
}

async function findUserId(admin: SupabaseClient, email: string): Promise<string | undefined> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
}

async function passwordSession(url: string, anon: string, user: SeedUser): Promise<Session> {
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data.session) {
    throw new Error(`sign-in ${user.email}: ${error?.message ?? "no session"}`);
  }
  return data.session;
}

// Turn a session into the exact @supabase/ssr cookie(s) by letting the
// library write them into a capturing jar — version- and project-ref-proof,
// no hand-rolling of the sb-<ref>-auth-token format.
async function sessionToStorageState(
  url: string,
  anon: string,
  session: Session,
  hostname: string,
) {
  const jar: { name: string; value: string }[] = [];
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => jar.map((c) => ({ name: c.name, value: c.value })),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          const i = jar.findIndex((c) => c.name === name);
          if (i >= 0) jar[i]!.value = value;
          else jar.push({ name, value });
        }
      },
    },
  });
  await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return {
    cookies: jar.map((c) => ({
      name: c.name,
      value: c.value,
      domain: hostname,
      path: "/",
      expires,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [] as { origin: string; localStorage: { name: string; value: string }[] }[],
  };
}

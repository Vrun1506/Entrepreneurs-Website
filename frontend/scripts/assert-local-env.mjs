#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Refuse to start a dev server pointed at a remote Supabase.
//
// `next dev` loads .env.local automatically, and this repo's .env.local
// holds PRODUCTION credentials — so the default, most obvious command
// (`npm run dev`) used to boot a hot-reloading dev server with a service-role
// key for the live project. Every seed script, every stray click through an
// admin queue, every half-finished migration test lands on real members.
//
// That has already cost this project once: a script sourced .env.local and
// seeded three users and an admin into production.
//
// So the dev script asks this first. A remote host is a hard stop, not a
// warning, because a warning scrolls past.
//
// To deliberately point a local server at a remote project (rare, and worth
// having to think about), set ALLOW_REMOTE_SUPABASE=1 for that one command.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from "node:fs";

// This runs before `next dev`, so Next has not loaded any .env file yet and
// process.env is bare. To judge what the server is about to connect to, the
// guard has to resolve the env the same way Next.js will.
//
// Next's precedence, highest first: the real process environment, then
// .env.development.local, .env.local, .env.development, .env. First file to
// define a key wins; later ones do not override it.
const ENV_FILES = [".env.development.local", ".env.local", ".env.development", ".env"];

function resolve(key) {
  if (process.env[key]) return { value: process.env[key], from: "process env" };
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      if (line.slice(0, eq).trim() !== key) continue;
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (value) return { value, from: file };
    }
  }
  return { value: "", from: null };
}

const { value: url, from } = resolve("NEXT_PUBLIC_SUPABASE_URL");
const escape = process.env.ALLOW_REMOTE_SUPABASE === "1";

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

const die = (lines) => {
  const w = 74;
  console.error("\n\x1b[41m\x1b[37m" + " ".repeat(w) + "\x1b[0m");
  console.error("\x1b[41m\x1b[37m  REFUSING TO START — dev server is pointed at a remote database".padEnd(w) + "\x1b[0m");
  console.error("\x1b[41m\x1b[37m" + " ".repeat(w) + "\x1b[0m\n");
  for (const l of lines) console.error("  " + l);
  console.error("");
  process.exit(1);
};

if (escape) {
  console.warn("\x1b[33m⚠  ALLOW_REMOTE_SUPABASE=1 — dev server is talking to a REMOTE Supabase.\x1b[0m");
  process.exit(0);
}

if (!url) {
  die([
    "NEXT_PUBLIC_SUPABASE_URL is not set.",
    "",
    "Start the local stack and copy its values into frontend/.env.development.local:",
    "",
    "  npx supabase@2.105.0 start",
    "  npx supabase@2.105.0 status -o env",
    "",
    "See .env.example for the full list of variables.",
  ]);
}

let host;
try {
  host = new URL(url).host;
} catch {
  die([`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`]);
}

if (!LOCAL.test(new URL(url).origin)) {
  die([
    `NEXT_PUBLIC_SUPABASE_URL resolves to \x1b[1m${host}\x1b[0m, which is not localhost.`,
    `It is coming from \x1b[1m${from}\x1b[0m.`,
    "",
    ".env.local in this repo holds PRODUCTION credentials, and `next dev`",
    "loads it by default.",
    "",
    "Fix it by giving dev its own env, which Next.js loads at higher priority:",
    "",
    "  npx supabase@2.105.0 start",
    "  npx supabase@2.105.0 status -o env   # copy API_URL + PUBLISHABLE_KEY + SECRET_KEY",
    "  # into frontend/.env.development.local",
    "",
    "If you genuinely meant to point at a remote project:",
    "",
    "  ALLOW_REMOTE_SUPABASE=1 pnpm dev",
  ]);
}

console.log(`\x1b[32m✓\x1b[0m Supabase → ${host}  (local, from ${from})`);

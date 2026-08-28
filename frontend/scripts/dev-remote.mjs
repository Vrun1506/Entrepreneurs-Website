#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Run the dev server against the REMOTE (production) Supabase project.
//
// `pnpm dev` is guarded by assert-local-env.mjs and refuses a non-localhost
// host. That guard is the right default and stays exactly as it is. This is
// the deliberate way past it: a separately named command, so reaching
// production is something you type on purpose rather than the thing that
// happens when you run the most obvious script in the repo.
//
// ALLOW_REMOTE_SUPABASE=1 alone is NOT enough to get here. It silences the
// guard, but Next.js still loads .env.development.local at a HIGHER priority
// than .env.local, so the server would quietly keep talking to 127.0.0.1
// while printing a warning that it was talking to production — the worst of
// both. This script fixes that by loading .env.local into the real process
// environment, which outranks every .env file Next reads.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const FILE = ".env.local";

if (!existsSync(FILE)) {
  console.error(`\n  ${FILE} not found — nothing to point at.\n`);
  process.exit(1);
}

// Same parse as assert-local-env.mjs: KEY=value, first definition wins,
// # comments and blanks skipped, surrounding quotes stripped.
const vars = new Map();
for (const raw of readFileSync(FILE, "utf8").split("\n")) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && value && !vars.has(key)) vars.set(key, value);
}

const url = vars.get("NEXT_PUBLIC_SUPABASE_URL");
if (!url) {
  console.error(`\n  ${FILE} does not define NEXT_PUBLIC_SUPABASE_URL.\n`);
  process.exit(1);
}

let host;
try {
  host = new URL(url).host;
} catch {
  console.error(`\n  NEXT_PUBLIC_SUPABASE_URL in ${FILE} is not a valid URL: ${url}\n`);
  process.exit(1);
}

// Real process env beats .env.development.local, .env.local, .env.development
// and .env — so these are what the server will actually use.
for (const [key, value] of vars) process.env[key] = value;
process.env.ALLOW_REMOTE_SUPABASE = "1";

const w = 74;
const bar = (text = "") => "\x1b[41m\x1b[37m" + ("  " + text).padEnd(w) + "\x1b[0m";
console.log("");
console.log(bar());
console.log(bar("DEV SERVER → PRODUCTION DATABASE"));
console.log(bar(host));
console.log(bar());
console.log("");
console.log(`  Every write goes to the live project. ${vars.size} variables loaded from ${FILE},`);
console.log("  including a service-role key, into a hot-reloading server.");
console.log("");
console.log("  \x1b[2mFor the local stack instead: pnpm dev\x1b[0m");
console.log("");

spawn("next", ["dev", ...process.argv.slice(2)], { stdio: "inherit", shell: true })
  .on("exit", (code) => process.exit(code ?? 0));

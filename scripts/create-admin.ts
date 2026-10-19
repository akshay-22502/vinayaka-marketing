// Creates an admin user: the Supabase Auth account (email confirmed) plus its row in
// `admins`. Run it once at launch for the owner:
//
//   npm run -s create-admin -- owner@example.com
//
// The password is asked for (twice, hidden) on the terminal. To run it without a terminal,
// or to paste it from a password manager, set ADMIN_PASSWORD for that one command:
//
//   ADMIN_PASSWORD='a-long-password' npm run -s create-admin -- owner@example.com
//
// Keep the `-s`: without it npm prints the whole command line it runs, and a password given as
// an argument would end up in your terminal and in any log. For the same reason a password as a
// second argument (`<email> <password>`) works but is discouraged: it also stays in your shell
// history and is visible to other users in the process list. The script never prints it.
//
// Running it again for the same address sets that password and keeps the user an admin.
//
// The site is meant to have one admin. If a different admin already exists, the script stops
// rather than add or promote a second one; add `--force` when that is what you want.
//
// Which Supabase project it changes:
//   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY both set: that project. For the
//     live site, use the values from Supabase > Project Settings > API (the same ones as
//     in Vercel). The script prints the URL it is using before it does anything.
//   - Neither set: the local stack from `npm run db:start`.
//   - Only one set: it stops, rather than mixing a live URL with a local key.
//
// Run with Node's type stripping, like scripts/e2e-prepare.ts (hence the explicit .ts extensions
// on the imports below). All user creation lives in ensureUser, shared with the tests.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readLocalSupabaseEnv } from "./lib/local-supabase.ts";
import { promptHidden } from "./lib/prompt.ts";
import { ensureUser } from "./lib/users.ts";

const MIN_PASSWORD_LENGTH = 10;
const USAGE = `Usage: npm run -s create-admin -- <email> [--force]

  The password is read from the ADMIN_PASSWORD environment variable, or asked for (hidden)
  when that is not set. Keep the -s: without it npm prints the command line it runs.
  A password as a second argument also works, but avoid it: it stays in your shell history.
  --force  add or promote this user even though a different admin already exists.`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: string[]): { email: string; passwordArg: string | undefined; force: boolean } {
  const positional: string[] = [];
  let force = false;
  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg.startsWith("--")) fail(`Unknown option ${arg}.\n${USAGE}`);
    else positional.push(arg);
  }
  if (positional.length < 1 || positional.length > 2) fail(USAGE);

  const [email, passwordArg] = positional;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not a valid email address.\n${USAGE}`);
  if (passwordArg !== undefined) checkPassword(passwordArg);
  return { email, passwordArg, force };
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
}

/** The second argument, else ADMIN_PASSWORD, else a hidden prompt (asked twice). */
async function resolvePassword(passwordArg: string | undefined): Promise<string> {
  if (passwordArg !== undefined) return passwordArg;

  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) {
    checkPassword(fromEnv);
    return fromEnv;
  }

  if (!process.stdin.isTTY) {
    fail(
      "There is no password. Set ADMIN_PASSWORD for this command, or run it in a terminal to be asked.\n" +
        USAGE,
    );
  }
  const password = await promptHidden("Password: ");
  checkPassword(password);
  const repeated = await promptHidden("Repeat password: ");
  if (repeated !== password) fail("The two passwords do not match.");
  return password;
}

function resolveTarget(): { url: string; serviceKey: string; local: boolean } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (url && serviceKey) return { url, serviceKey, local: false };
  if (url || serviceKey) {
    const missing = url ? "SUPABASE_SERVICE_ROLE_KEY" : "NEXT_PUBLIC_SUPABASE_URL";
    fail(
      `${missing} is not set. Set both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use a Supabase project, or neither to use the local stack.`,
    );
  }

  const local = readLocalSupabaseEnv();
  return { url: local.NEXT_PUBLIC_SUPABASE_URL, serviceKey: local.SUPABASE_SERVICE_ROLE_KEY, local: true };
}

/** The email addresses of every current admin (there may be none). */
async function adminEmails(service: SupabaseClient): Promise<string[]> {
  const rows = await service.from("admins").select("user_id");
  if (rows.error) throw new Error(`Could not read the admins: ${rows.error.message}`);

  const emails: string[] = [];
  for (const { user_id } of rows.data) {
    const found = await service.auth.admin.getUserById(user_id);
    if (found.error) throw new Error(`Could not read an admin's account: ${found.error.message}`);
    emails.push(found.data.user?.email?.toLowerCase() ?? user_id);
  }
  return emails;
}

async function main(): Promise<void> {
  const { email: rawEmail, passwordArg, force } = parseArgs(process.argv.slice(2));
  const email = rawEmail.trim().toLowerCase();

  const target = resolveTarget();
  console.log(
    target.local
      ? `Using the local Supabase stack at ${target.url}`
      : `Using the Supabase project at ${target.url}`,
  );
  const service = createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // One admin: an address that is already an admin may run this again (a password reset); anyone
  // else, new or existing, would be a second admin and needs --force.
  if (!force) {
    const current = await adminEmails(service);
    if (current.length > 0 && !current.includes(email)) {
      fail(
        `This site already has an admin (${current.join(", ")}), and it is meant to have just one. ` +
          `Nothing was changed. To add ${email} as another admin anyway, run the command again with --force.`,
      );
    }
  }

  const password = await resolvePassword(passwordArg);
  const id = await ensureUser(service, email, password, { admin: true });
  console.log(`Admin ready: ${email} (user id ${id})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

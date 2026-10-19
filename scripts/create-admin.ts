// Creates an admin user: the Supabase Auth account (email confirmed) plus its row in
// `admins`. Run it once at launch for the owner, and again to add or reset an admin:
//
//   npm run create-admin -- owner@example.com 'a-long-password'
//
// Running it for an existing address sets that password and keeps the user an admin.
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

import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseEnv } from "./lib/local-supabase.ts";
import { ensureUser } from "./lib/users.ts";

const MIN_PASSWORD_LENGTH = 10;
const USAGE = "Usage: npm run create-admin -- <email> <password>";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2) fail(USAGE);
  const [email, password] = args;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" is not a valid email address.\n${USAGE}`);
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.\n${USAGE}`);
  }

  const target = resolveTarget();
  console.log(
    target.local
      ? `Using the local Supabase stack at ${target.url}`
      : `Using the Supabase project at ${target.url}`,
  );

  const service = createClient(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const id = await ensureUser(service, email, password, { admin: true });
  console.log(`Admin ready: ${email.trim().toLowerCase()} (user id ${id})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

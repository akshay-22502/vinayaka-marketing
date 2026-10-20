// The db and e2e test suites reset the database and create users, so they must only ever talk to
// the Supabase stack on this machine (`npm run db:start`), never to the live project. The guards
// below are called by tests/db/global-setup.ts, playwright.config.ts and scripts/e2e-prepare.ts.
// Nothing here prints a key: errors name the host only.
//
// `npm run create-admin` deliberately does not use these: it is meant for the live project.
//
// Imported by scripts run with Node's type stripping (hence no imports and only erasable syntax).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

const FIX =
  "Run `unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL` " +
  "(or open a fresh terminal) and try again. Never run the tests against a live project: they reset data and create users.";

function isLocalAddress(value: string | undefined, protocols: readonly string[]): boolean {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return protocols.includes(url.protocol) && LOCAL_HOSTS.has(url.hostname);
}

/** True for an http(s) address on this machine: 127.0.0.1, localhost or [::1]. */
export function isLocalSupabaseUrl(url: string | undefined): boolean {
  return isLocalAddress(url, ["http:", "https:"]);
}

/** True for a Postgres connection string to this machine (SUPABASE_DB_URL). */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  return isLocalAddress(url, ["postgres:", "postgresql:"]);
}

/**
 * Throws unless `url` (NEXT_PUBLIC_SUPABASE_URL) is an http(s) address on this machine.
 * `where` names the caller, for the message. The message holds the host only, never the
 * rest of the address, so a key embedded in it cannot leak into a log.
 */
export function assertLocalSupabase(url: string | undefined, where: string): void {
  if (isLocalSupabaseUrl(url)) return;

  if (!url) {
    throw new Error(
      `${where}: NEXT_PUBLIC_SUPABASE_URL is not set, so there is no local Supabase to test against. ` +
        "Start it with `npm run db:start`, then run the tests through `npm run test:db` or `npm run test:e2e`.",
    );
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`${where}: NEXT_PUBLIC_SUPABASE_URL is not a valid URL, and the tests only run against the local Supabase. ${FIX}`);
  }
  throw new Error(
    `${where}: refusing to run against the Supabase host "${host}". The tests only run against the local stack ` +
      `(http://127.0.0.1:54321). ${FIX}`,
  );
}

/**
 * For the start of `npm run test:e2e`, before anything is written: refuses a shell that has a
 * live NEXT_PUBLIC_SUPABASE_URL, or a SUPABASE_SERVICE_ROLE_KEY without a URL (it could only be
 * the live one). Shell values beat .env.production.local in `next build`, so they must be absent
 * or local. `env` is a parameter so tests can pass their own.
 */
export function assertShellHasNoLiveSupabase(
  where: string,
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.NEXT_PUBLIC_SUPABASE_URL) {
    assertLocalSupabase(env.NEXT_PUBLIC_SUPABASE_URL, where);
    return;
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      `${where}: SUPABASE_SERVICE_ROLE_KEY is set in your shell but NEXT_PUBLIC_SUPABASE_URL is not, so it is ` +
        `probably the live project's key. ${FIX}`,
    );
  }
}

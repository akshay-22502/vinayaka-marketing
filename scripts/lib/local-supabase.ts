import { execFileSync } from "node:child_process";

/**
 * Connection details of the local Supabase stack (`npm run db:start`), read from
 * `supabase status -o env` and mapped onto the app's env var names plus
 * SUPABASE_DB_URL (direct Postgres, for tests only).
 */
export function readLocalSupabaseEnv(): Record<string, string> {
  let output: string;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (cause) {
    throw new Error(
      "Could not read the local Supabase status. Start the stack first: npm run db:start",
      { cause },
    );
  }

  const raw: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match) raw[match[1]] = match[2];
  }

  const mapped = {
    NEXT_PUBLIC_SUPABASE_URL: raw.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: raw.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: raw.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: raw.DB_URL,
  };
  for (const [name, value] of Object.entries(mapped)) {
    if (!value) throw new Error(`supabase status did not report ${name}`);
  }
  return mapped as Record<string, string>;
}

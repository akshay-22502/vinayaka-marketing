import {
  assertLocalSupabase,
  isLocalDatabaseUrl,
  isLocalSupabaseUrl,
} from "../../scripts/lib/assert-local-supabase";
import { readLocalSupabaseEnv } from "../../scripts/lib/local-supabase";

/**
 * Runs once before the db project's tests: points them at the local Supabase
 * stack, and refuses to run against anything else (these tests reset data and
 * create users, so they must never touch the live project).
 *
 * Shell variables are kept only when all four are set and the URLs point at this
 * machine (for example in CI). Otherwise all four come from `supabase status`
 * and replace what the shell had, so a live value can never be mixed with local ones.
 */
export default function setup(): void {
  const needed = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
  ];
  const keepShellValues =
    needed.every((name) => process.env[name]) &&
    isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isLocalDatabaseUrl(process.env.SUPABASE_DB_URL);

  if (!keepShellValues) Object.assign(process.env, readLocalSupabaseEnv());

  assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL, "tests/db/global-setup.ts");
}

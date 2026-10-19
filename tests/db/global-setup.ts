import { readLocalSupabaseEnv } from "../../scripts/lib/local-supabase";

/**
 * Runs once before the db project's tests: points them at the local Supabase
 * stack. Variables that are already set (for example in CI) win.
 */
export default function setup(): void {
  const needed = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
  ];
  if (needed.every((name) => process.env[name])) return;

  for (const [name, value] of Object.entries(readLocalSupabaseEnv())) {
    process.env[name] ??= value;
  }
}

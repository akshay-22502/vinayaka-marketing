import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Anonymous Supabase client for public pages: what a visitor can read.
 *
 * It never touches cookies or headers, so pages that use it can be cached
 * (ISR) and are not turned into per-request pages. Row level security decides
 * what comes back; the queries in `@/lib/content/queries` add their own
 * published checks on top.
 *
 * Created on first use rather than on import, so the env vars are read when a
 * query runs (not while the module loads during a build).
 */
export function getPublicClient(): SupabaseClient {
  if (client) return client;

  // Written out in full (not process.env[name]) so Next can inline the values.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.",
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

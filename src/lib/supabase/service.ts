import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/**
 * Service-role Supabase client: it bypasses row level security, so it is for
 * server code that has already decided the caller may do the thing (the quote
 * API, which validates, checks the captcha and rate-limits first).
 *
 * `server-only` makes the build fail if this module is ever imported from client
 * code, where the key would end up in the browser bundle.
 *
 * Created on first use, not on import, so `next build` does not need the secret
 * and a missing key becomes an error for the request that needs it.
 */
export function getServiceClient(): SupabaseClient {
  if (client) return client;

  // Written out in full (not process.env[name]) so Next can inline the value.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing required environment variable NEXT_PUBLIC_SUPABASE_URL. See .env.example.");
  }
  const serviceRoleKey = requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

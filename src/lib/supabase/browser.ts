import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicConfig } from "./config";

/**
 * Supabase client for Client Components in the admin area, for example to upload
 * files straight to Storage. It shares the signed-in user's session with the server
 * through cookies, so row level and Storage policies apply to the admin, not to a
 * visitor. In the browser it returns the same client every time.
 */
export function getBrowserClient(): SupabaseClient {
  const { url, anonKey } = supabasePublicConfig();
  return createBrowserClient(url, anonKey);
}

/**
 * The project URL and anon key (both public) that the cookie-based clients need:
 * the server client, the browser client and the middleware.
 *
 * Written out in full (not process.env[name]) so Next can inline the values into
 * the browser and middleware bundles.
 */
export function supabasePublicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.",
    );
  }
  return { url, anonKey };
}

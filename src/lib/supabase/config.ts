import { env } from "@/lib/env";

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

/**
 * Cookie settings for the session, shared by the server client and the middleware so the two
 * never disagree. The cookies are marked Secure when the site is served over https (production
 * and Vercel previews). A plain-http site, such as local development or the E2E run on
 * http://localhost, keeps them without the flag.
 *
 * Needs the site URL, so it is for server code; the browser client checks its own protocol.
 */
export function supabaseCookieOptions(): { secure: boolean } {
  return { secure: env.NEXT_PUBLIC_SITE_URL.startsWith("https://") };
}

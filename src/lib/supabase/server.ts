import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";

/**
 * Supabase client for a signed-in user, for Server Components, Server Actions and
 * Route Handlers under /admin. It reads the session from the request's cookies, so
 * every query runs with that user's JWT and row level security applies: this is the
 * client that makes Postgres, not the app code, the real permission check.
 *
 * Create one per request (never keep it in a module-level variable): it is bound to
 * this request's cookies. Reading the cookies makes the calling page dynamic, which
 * is why public pages use `getPublicClient()` instead.
 *
 * To know who is signed in, call `supabase.auth.getUser()`, which asks Supabase Auth
 * to verify the token. Never trust `getSession()` on the server: it only decodes the
 * cookie. Most admin code should call `requireAdmin()`, which does this and more.
 */
export async function getServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, anonKey } = supabasePublicConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. That is fine: the middleware refreshes
          // the session on every /admin request and writes the cookies there, and Server
          // Actions (sign in, sign out) can set them.
        }
      },
    },
  });
}

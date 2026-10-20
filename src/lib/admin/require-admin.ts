import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerClient } from "@/lib/supabase/server";

/** Where a visitor without an admin session is sent. */
export const LOGIN_PATH = "/admin/login";
/** Where a signed-in user who is not an admin is sent (the login page explains why). */
export const NOT_ADMIN_PATH = "/admin/login?error=not-admin";

/**
 * Whether the user behind this client is an admin, according to the database
 * (`is_admin()` reads the `admins` table with the caller's JWT). Throws when the
 * check cannot be made, so an outage is an error page and not a false "no".
 */
export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(`Could not check admin access: ${error.message}`);
  return data === true;
}

/**
 * Gate for everything under /admin except the login page. Call it first in every
 * protected page, layout and Server Action. A layout alone is not enough: Next does
 * not render a layout again when you move between its pages, and Server Actions are
 * public endpoints that never go through a layout.
 *
 *  - No valid session: redirects to the login page.
 *  - A session that is not an admin: signs it out, then redirects to the login page
 *    with `?error=not-admin`.
 *  - An admin: returns their id and a Supabase client that carries their session,
 *    so row level security applies to everything they do.
 *
 * Who the user is comes from `auth.getUser()`, which Supabase Auth verifies;
 * `getSession()` only decodes the cookie and must not be used for this. Wrapped in
 * React's `cache`, so a layout and a page rendered for the same request check once.
 */
export const requireAdmin = cache(async (): Promise<{ userId: string; supabase: SupabaseClient }> => {
  const supabase = await getServerClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect(LOGIN_PATH);

  if (!(await isAdmin(supabase))) {
    // In a Server Component the cookies cannot be cleared, but this ends the session on
    // the server, so the leftover cookie is useless. Actions clear the cookies as well.
    await supabase.auth.signOut();
    redirect(NOT_ADMIN_PATH);
  }

  return { userId: data.user.id, supabase };
});

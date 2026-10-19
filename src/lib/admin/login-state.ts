import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin/require-admin";

export const NOT_ADMIN_MESSAGE = "This account does not have admin access";
export const CHECK_FAILED_MESSAGE = "We could not check your account just now. Please try signing in again.";

/**
 * What the login page does with the session it finds: send a signed-in admin to the dashboard,
 * or show the form, with an error when there is one to show.
 *
 * `errorParam` is the `error` query parameter. Only the one known value is explained; anything
 * else is ignored, so the query string is never echoed back. If the admin check itself fails,
 * the form is still shown (with a generic error) rather than an error page, so the person can
 * try again.
 */
export async function resolveLoginState(
  supabase: SupabaseClient,
  errorParam: string | string[] | undefined,
): Promise<{ redirectTo: "/admin" | null; error: string | undefined }> {
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    try {
      if (await isAdmin(supabase)) return { redirectTo: "/admin", error: undefined };
    } catch (error) {
      console.error("Could not check admin access on the login page", error);
      return { redirectTo: null, error: CHECK_FAILED_MESSAGE };
    }
  }

  return { redirectTo: null, error: errorParam === "not-admin" ? NOT_ADMIN_MESSAGE : undefined };
}

"use server";

import { redirect } from "next/navigation";
import { isAdmin, LOGIN_PATH, NOT_ADMIN_PATH } from "@/lib/admin/require-admin";
import { getServerClient } from "@/lib/supabase/server";

/** What the login form shows after a failed attempt. */
export type SignInState = { error: string } | null;

// One message for every credential problem (no such user, wrong password, unconfirmed or
// banned account), so the form never tells a stranger which emails have accounts.
const WRONG_CREDENTIALS = "Incorrect email or password";
const TOO_MANY_ATTEMPTS = "Too many sign-in attempts. Please wait a few minutes and try again.";
const UNAVAILABLE = "We could not reach the sign-in service. Please try again.";

/**
 * Signs in with email and password. On success it sets the session cookies and goes to the
 * dashboard; a user who is not an admin is signed straight out again and sent back to the
 * login page with the reason. Anything else returns an error for the form to show.
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return { error: WRONG_CREDENTIALS };
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    // Only outcomes that say nothing about the account get their own text.
    if (error?.status === 429) return { error: TOO_MANY_ATTEMPTS };
    if (error?.name === "AuthRetryableFetchError") return { error: UNAVAILABLE };
    return { error: WRONG_CREDENTIALS };
  }

  if (!(await isAdmin(supabase))) {
    await supabase.auth.signOut();
    redirect(NOT_ADMIN_PATH);
  }
  redirect("/admin");
}

/** Ends the session (on the server too) and returns to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await getServerClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

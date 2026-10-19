import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ensureUser } from "../../scripts/lib/users";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run the db tests with: npm run test:db`);
  return value;
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Unauthenticated client: what a public visitor gets. */
export function anonClient(): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    clientOptions,
  );
}

/** Service-role client: bypasses RLS. */
export function serviceClient(): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    clientOptions,
  );
}

/** Client signed in as the given user, so requests carry that user's JWT. */
export async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Creates (or reuses) a confirmed user, as an admin or not; returns the user id. */
export function createUser(
  email: string,
  password: string,
  opts: { admin: boolean },
): Promise<string> {
  return ensureUser(serviceClient(), email, password, opts);
}

import {
  combineChunks,
  createChunks,
  createServerClient,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";
import { expect, type BrowserContext } from "@playwright/test";
import { E2E_PASSWORD } from "../../scripts/lib/e2e-users";

// Signs an e2e user in without typing a password into the login form, for the admin specs.
// Supabase rate-limits sign-ins per IP (30 per 5 minutes locally), so only the specs about the
// login form itself use the form; the others start from a session cookie made with the same
// @supabase/ssr code the app uses.

export const BASE_URL = "http://localhost:3100";

export function envVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`The e2e env (${name}) is not loaded.`);
  return value;
}

export type SessionCookie = { name: string; value: string };
type StoredSession = { access_token: string; refresh_token: string; expires_at: number };

const AUTH_COOKIE = /^(sb-.+-auth-token)(\.\d+)?$/;
const VALUE_PREFIX = "base64-";

/** The session inside the (possibly chunked) Supabase auth cookie. */
export async function readSession(cookies: SessionCookie[]): Promise<StoredSession> {
  const base = cookies.map((cookie) => AUTH_COOKIE.exec(cookie.name)?.[1]).find(Boolean);
  if (!base) throw new Error("There is no Supabase auth cookie.");
  const value = await combineChunks(base, (name) => cookies.find((cookie) => cookie.name === name)?.value);
  if (!value?.startsWith(VALUE_PREFIX)) throw new Error("The auth cookie is not in the base64 format.");
  return JSON.parse(stringFromBase64URL(value.slice(VALUE_PREFIX.length))) as StoredSession;
}

/** The same cookies with the access token marked as expired an hour ago (the refresh token is intact). */
async function withExpiredAccessToken(cookies: SessionCookie[]): Promise<SessionCookie[]> {
  const base = cookies.map((cookie) => AUTH_COOKIE.exec(cookie.name)?.[1]).find(Boolean)!;
  const session = { ...(await readSession(cookies)), expires_at: Math.floor(Date.now() / 1000) - 3600 };
  const value = VALUE_PREFIX + stringToBase64URL(JSON.stringify(session));
  return createChunks(base, value).map(({ name, value }) => ({ name, value }));
}

/**
 * Signs in with @supabase/ssr and puts the resulting session cookies into the browser context;
 * returns them. With `expired`, the access token in them is already out of date.
 */
export async function signInWithCookie(
  context: BrowserContext,
  email: string,
  opts: { expired?: boolean } = {},
): Promise<SessionCookie[]> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(
    envVar("NEXT_PUBLIC_SUPABASE_URL"),
    envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const { name, value } of cookies) jar.set(name, value);
        },
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  expect(jar.size, "session cookies written").toBeGreaterThan(0);

  let cookies = [...jar].map(([name, value]) => ({ name, value }));
  if (opts.expired) cookies = await withExpiredAccessToken(cookies);
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: BASE_URL })));
  return cookies;
}

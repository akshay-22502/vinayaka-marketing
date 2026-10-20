import "server-only";
import { env } from "@/lib/env";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

type VerifyOptions = {
  secret: string;
  fetchImpl?: typeof fetch;
};

/**
 * Asks Cloudflare whether a Turnstile token is valid. Any trouble (no token, a
 * network error, an error reply, an unreadable body) counts as "not valid", so
 * the caller can only ever fail closed.
 */
export async function verifyTurnstile(
  token: string,
  ip: string,
  { secret, fetchImpl = fetch }: VerifyOptions,
): Promise<boolean> {
  if (!token.trim()) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return (
      typeof result === "object" && result !== null && (result as { success?: unknown }).success === true
    );
  } catch {
    return false;
  }
}

let warnedAboutFallback = false;

/**
 * The captcha check the quote API uses, built from the environment.
 *
 * With TURNSTILE_SECRET_KEY it asks Cloudflare. Without it, it throws (the route
 * answers 500 and logs it), unless ALLOW_DEV_FALLBACKS is exactly "true", where it
 * passes every request so the sandbox and E2E runs can submit the form.
 */
export function createCaptchaVerifier(): (token: string, ip: string) => Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (secret) return (token, ip) => verifyTurnstile(token, ip, { secret });

  if (!env.devFallbacksAllowed()) {
    throw new Error("Missing required environment variable TURNSTILE_SECRET_KEY. See .env.example.");
  }
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn("[quote] TURNSTILE_SECRET_KEY is not set: skipping the captcha (ALLOW_DEV_FALLBACKS=true).");
  }
  return async () => true;
}

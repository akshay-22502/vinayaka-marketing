import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True when the Authorization header is exactly `Bearer <secret>`, which is how Vercel Cron
 * authenticates a call when the project has a CRON_SECRET variable. An unset or blank secret
 * authorises nothing, so a missing variable can never leave the route open.
 *
 * Both sides are hashed first so the comparison takes the same time whatever the input, and
 * `timingSafeEqual` gets buffers of equal length.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!authorization || !secret?.trim()) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

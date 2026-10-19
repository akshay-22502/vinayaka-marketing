import { createHmac } from "node:crypto";

/** The visitor's address: the first x-forwarded-for entry (the one the platform adds), else "unknown". */
export function clientIp(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * SHA-256 (keyed with the salt) of an address, as hex. Quote requests store this
 * instead of the address, which is enough for the per-hour rate limit.
 */
export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

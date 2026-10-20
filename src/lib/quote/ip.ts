import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

/** The visitor's address: the first x-forwarded-for entry (the one the platform adds), else "unknown". */
export function clientIp(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/** The eight 16-bit groups of an IPv6 address, or null if it is not a valid one. */
function ipv6Groups(address: string): number[] | null {
  let text = address.trim();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  text = text.replace(/%.*$/, ""); // zone id, as in fe80::1%eth0
  if (!isIPv6(text)) return null;

  // An embedded IPv4 tail (::ffff:203.0.113.7) stands for the last two groups.
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text)?.[1];
  if (tail) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    text = `${text.slice(0, -tail.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = text.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves[1] ? halves[1].split(":") : [];
  const groups =
    halves.length === 2 ? [...head, ...Array<string>(8 - head.length - rest.length).fill("0"), ...rest] : head;
  if (groups.length !== 8) return null;
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  return numbers.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? numbers : null;
}

/**
 * What the rate limit counts as "one visitor". An IPv4 address is itself. An IPv6 address is
 * its /64 prefix, because one home or mobile connection is handed a whole /64 and can rotate
 * through billions of addresses in it. An IPv4-mapped IPv6 address (::ffff:a.b.c.d) is that
 * IPv4 address. Anything that is not an address (such as "unknown") is returned unchanged.
 */
export function rateLimitKey(ip: string): string {
  const groups = ipv6Groups(ip);
  if (!groups) return ip;

  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const high = groups[6]!;
    const low = groups[7]!;
    return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
  }
  return `v6/64:${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}`;
}

/**
 * SHA-256 (keyed with the salt) of the visitor's rate-limit key, as hex. Quote requests store
 * this instead of the address, which is enough for the per-hour rate limit. Addresses in the
 * same IPv6 /64 hash alike (see `rateLimitKey`); IPv4 addresses hash as they always did.
 */
export function hashIp(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(rateLimitKey(ip)).digest("hex");
}

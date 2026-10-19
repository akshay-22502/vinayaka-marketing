import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { clientIp, hashIp, rateLimitKey } from "@/lib/quote/ip";

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("trims the entry and handles a single address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "  198.51.100.4 " }))).toBe("198.51.100.4");
  });

  it("falls back to 'unknown' when the header is missing or blank", () => {
    expect(clientIp(new Headers())).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientIp(new Headers({ "x-forwarded-for": " , 10.0.0.1" }))).toBe("unknown");
  });
});

describe("hashIp", () => {
  it("is a stable sha256 hex digest for the same ip and salt", () => {
    const a = hashIp("203.0.113.7", "salt-one");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashIp("203.0.113.7", "salt-one")).toBe(a);
  });

  it("differs across salts and across addresses", () => {
    expect(hashIp("203.0.113.7", "salt-one")).not.toBe(hashIp("203.0.113.7", "salt-two"));
    expect(hashIp("203.0.113.7", "salt-one")).not.toBe(hashIp("203.0.113.8", "salt-one"));
  });

  it("does not contain the address", () => {
    expect(hashIp("203.0.113.7", "salt-one")).not.toContain("203");
  });
});

describe("rateLimitKey", () => {
  it("leaves IPv4 addresses and non-addresses unchanged", () => {
    expect(rateLimitKey("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitKey("unknown")).toBe("unknown");
    expect(rateLimitKey("not an ip")).toBe("not an ip");
  });

  it("treats an IPv4-mapped IPv6 address as the IPv4 address", () => {
    expect(rateLimitKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitKey("::FFFF:203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitKey("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(rateLimitKey("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("keys an IPv6 address by its /64 prefix", () => {
    const key = rateLimitKey("2001:db8:aaaa:bbbb:1:2:3:4");
    expect(key).toBe(rateLimitKey("2001:db8:aaaa:bbbb:ffff:ffff:ffff:ffff"));
    expect(key).toBe(rateLimitKey("2001:db8:aaaa:bbbb::"));
    expect(key).not.toBe(rateLimitKey("2001:db8:aaaa:bbbc:1:2:3:4"));
    expect(key).not.toBe(rateLimitKey("2001:db8:aaab:bbbb:1:2:3:4"));
  });

  it("gives every spelling of the same prefix the same key", () => {
    const key = rateLimitKey("2001:db8:0:1:9:9:9:9");
    expect(rateLimitKey("2001:0DB8:0000:0001:0009:0009:0009:0009")).toBe(key);
    expect(rateLimitKey("2001:db8::1:9:9:9:9")).toBe(key);
    expect(rateLimitKey("2001:db8:0:1::")).toBe(key);
    expect(rateLimitKey("[2001:db8:0:1::5]")).toBe(key);
    expect(rateLimitKey("2001:db8:0:1::5%eth0")).toBe(key);
  });

  it("handles addresses that compress away the whole prefix", () => {
    expect(rateLimitKey("::1")).toBe(rateLimitKey("0:0:0:0:ffff::2"));
    expect(rateLimitKey("::")).toBe(rateLimitKey("::1"));
    expect(rateLimitKey("::1")).not.toBe(rateLimitKey("2001:db8::1"));
  });

  it("cannot collide an IPv6 prefix with an IPv4 address", () => {
    expect(rateLimitKey("2001:db8::1")).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });
});

describe("hashIp and IPv6 rotation", () => {
  it("gives addresses in one /64 the same hash, so rotating the host part does not reset the limit", () => {
    expect(hashIp("2001:db8:1:2:aaaa::1", "s")).toBe(hashIp("2001:db8:1:2:bbbb::2", "s"));
    expect(hashIp("2001:db8:1:2::1", "s")).not.toBe(hashIp("2001:db8:1:3::1", "s"));
  });

  it("treats ::ffff:a.b.c.d like a.b.c.d", () => {
    expect(hashIp("::ffff:203.0.113.7", "s")).toBe(hashIp("203.0.113.7", "s"));
  });

  it("leaves the hash of an IPv4 address as it was", () => {
    const expected = createHmac("sha256", "salt-one").update("203.0.113.7").digest("hex");
    expect(hashIp("203.0.113.7", "salt-one")).toBe(expected);
  });
});

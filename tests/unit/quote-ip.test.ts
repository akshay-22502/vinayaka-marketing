import { describe, expect, it } from "vitest";
import { clientIp, hashIp } from "@/lib/quote/ip";

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

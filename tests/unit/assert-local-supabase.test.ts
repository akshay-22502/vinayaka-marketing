import { describe, expect, it } from "vitest";
import {
  assertLocalSupabase,
  assertShellHasNoLiveSupabase,
  isLocalDatabaseUrl,
  isLocalSupabaseUrl,
} from "../../scripts/lib/assert-local-supabase";

// The guard that keeps the db and e2e suites (which reset data and create users) away from the
// live project. The keys below are made-up; the point of the last tests is that no key is printed.

const LIVE_URL = "https://abcdefghijklmnop.supabase.co";
const LIVE_KEY = "eyJhbGciOiJIUzI1NiJ9.live-service-role-key.signature";

/** The message a call throws, or "" when it does not throw. */
function messageOf(call: () => void): string {
  try {
    call();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("isLocalSupabaseUrl", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
    "https://localhost",
    "http://LOCALHOST:54321/rest/v1",
  ])("accepts %s", (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true);
  });

  it.each([
    ["a Supabase project", LIVE_URL],
    ["another IP address", "http://10.0.0.5:54321"],
    ["another loopback address", "http://127.0.0.2:54321"],
    ["a look-alike host", "http://localhost.evil.example"],
    ["a look-alike prefix", "http://127.0.0.1.evil.example"],
    ["local host as the user name", "https://127.0.0.1@abcdefghijklmnop.supabase.co"],
    ["local host in the path", "https://abcdefghijklmnop.supabase.co/127.0.0.1"],
    ["local host in the fragment", "https://abcdefghijklmnop.supabase.co#@localhost"],
    ["another protocol", "ftp://localhost:54321"],
    ["a bare host", "localhost:54321"],
    ["nothing", ""],
    ["text that is not a URL", "not a url"],
  ])("rejects %s", (_label, url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
  });

  it("rejects a missing value", () => {
    expect(isLocalSupabaseUrl(undefined)).toBe(false);
  });
});

describe("isLocalDatabaseUrl", () => {
  it("accepts a Postgres connection string to this machine", () => {
    expect(isLocalDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://postgres:postgres@localhost:54322/postgres")).toBe(true);
  });

  it("rejects a hosted database, an http address and a missing value", () => {
    expect(isLocalDatabaseUrl("postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres")).toBe(false);
    expect(isLocalDatabaseUrl("http://127.0.0.1:54322")).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });
});

describe("assertLocalSupabase", () => {
  it("passes for the local stack", () => {
    expect(() => assertLocalSupabase("http://127.0.0.1:54321", "tests/db/global-setup.ts")).not.toThrow();
    expect(() => assertLocalSupabase("http://localhost:54321", "playwright.config.ts")).not.toThrow();
    expect(() => assertLocalSupabase("http://[::1]:54321", "playwright.config.ts")).not.toThrow();
  });

  it("throws for a supabase.co URL, saying where, which host, and what to do", () => {
    expect(() => assertLocalSupabase(LIVE_URL, "playwright.config.ts")).toThrow(/playwright\.config\.ts/);
    expect(() => assertLocalSupabase(LIVE_URL, "playwright.config.ts")).toThrow(/abcdefghijklmnop\.supabase\.co/);
    expect(() => assertLocalSupabase(LIVE_URL, "playwright.config.ts")).toThrow(/unset NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => assertLocalSupabase(LIVE_URL, "playwright.config.ts")).toThrow(/never run the tests against a live project/i);
  });

  it("throws for an IP address that is not this machine", () => {
    expect(() => assertLocalSupabase("http://203.0.113.7:54321", "tests/db/global-setup.ts")).toThrow(/203\.0\.113\.7/);
  });

  it("throws for a missing or blank value", () => {
    expect(() => assertLocalSupabase(undefined, "playwright.config.ts")).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
    expect(() => assertLocalSupabase("", "playwright.config.ts")).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set/);
  });

  it("throws for text that is not a URL, without repeating it", () => {
    const message = messageOf(() => assertLocalSupabase(`${LIVE_KEY} oops`, "playwright.config.ts"));
    expect(message).toMatch(/not a valid URL/);
    expect(message).not.toContain(LIVE_KEY);
  });

  it("never prints a key, even when one is embedded in the address", () => {
    const withCredentials = `https://service_role:${LIVE_KEY}@abcdefghijklmnop.supabase.co/?apikey=${LIVE_KEY}`;
    const message = messageOf(() => assertLocalSupabase(withCredentials, "tests/db/global-setup.ts"));
    expect(message).toMatch(/abcdefghijklmnop\.supabase\.co/);
    expect(message).not.toContain(LIVE_KEY);
    expect(message).not.toContain("service_role:");
    expect(message).not.toContain("apikey");
  });
});

describe("assertShellHasNoLiveSupabase", () => {
  it("passes for a clean shell", () => {
    expect(() => assertShellHasNoLiveSupabase("scripts/e2e-prepare.ts", {})).not.toThrow();
  });

  it("passes when the shell holds the local stack's values", () => {
    expect(() =>
      assertShellHasNoLiveSupabase("scripts/e2e-prepare.ts", {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SERVICE_ROLE_KEY: "local-key",
      }),
    ).not.toThrow();
  });

  it("refuses a live URL", () => {
    expect(() =>
      assertShellHasNoLiveSupabase("scripts/e2e-prepare.ts", { NEXT_PUBLIC_SUPABASE_URL: LIVE_URL }),
    ).toThrow(/abcdefghijklmnop\.supabase\.co/);
  });

  it("refuses a service-role key when the URL is not set (it could only be a live one)", () => {
    const message = messageOf(() => assertShellHasNoLiveSupabase("scripts/e2e-prepare.ts", { SUPABASE_SERVICE_ROLE_KEY: LIVE_KEY }));
    expect(message).toMatch(/unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY/);
    expect(message).not.toContain(LIVE_KEY);
  });

  it("refuses a service-role key next to a live URL, without printing the key", () => {
    const message = messageOf(() =>
      assertShellHasNoLiveSupabase("scripts/e2e-prepare.ts", {
        NEXT_PUBLIC_SUPABASE_URL: LIVE_URL,
        SUPABASE_SERVICE_ROLE_KEY: LIVE_KEY,
      }),
    );
    expect(message).toMatch(/abcdefghijklmnop\.supabase\.co/);
    expect(message).not.toContain(LIVE_KEY);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseCookieOptions } from "@/lib/supabase/config";

// The session cookies are marked Secure when the site is served over https, and only then:
// the plain-http local and E2E runs must keep working.

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("supabaseCookieOptions", () => {
  it("is Secure when the site URL is https", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.terratechbharat.com");
    expect(supabaseCookieOptions()).toEqual({ secure: true });
  });

  it("is not Secure on plain-http localhost (local runs and E2E)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
    expect(supabaseCookieOptions()).toEqual({ secure: false });
  });

  it("is not Secure in local development without a site URL", () => {
    expect(supabaseCookieOptions()).toEqual({ secure: false });
  });

  it("is Secure on a Vercel preview, which is always https", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "terratechbharat-git-feature-acme.vercel.app");
    expect(supabaseCookieOptions()).toEqual({ secure: true });
  });
});

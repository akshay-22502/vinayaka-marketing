import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { env } from "@/lib/env";

// Each case starts from a clean slate (a local, non-Vercel run) and sets only what it needs.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env.NEXT_PUBLIC_SITE_URL", () => {
  describe("when NEXT_PUBLIC_SITE_URL is set", () => {
    it("uses it, dropping any trailing slash or path", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.terratechbharat.com/");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://www.terratechbharat.com");

      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100/some/path");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3100");
    });

    it("wins over the Vercel preview address and works in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL_URL", "terratechbharat-git-feature-acme.vercel.app");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.terratechbharat.com");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://www.terratechbharat.com");
    });

    it("treats a blank value as unset", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "   ");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    });
  });

  describe("on Vercel without NEXT_PUBLIC_SITE_URL", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production"); // Vercel builds run as production builds
      vi.stubEnv("VERCEL_URL", "terratechbharat-git-feature-acme.vercel.app");
    });

    it("a Preview build uses its own https address", () => {
      vi.stubEnv("VERCEL_ENV", "preview");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://terratechbharat-git-feature-acme.vercel.app");
    });

    it("`vercel dev` uses the https address too", () => {
      vi.stubEnv("VERCEL_ENV", "development");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://terratechbharat-git-feature-acme.vercel.app");
    });

    it("a Production build still fails loudly (VERCEL_URL is a deployment address, not the canonical one)", () => {
      vi.stubEnv("VERCEL_ENV", "production");
      expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow(/NEXT_PUBLIC_SITE_URL/);
    });

    it("a Preview build without VERCEL_URL fails loudly rather than guessing", () => {
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL_URL", "");
      expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow(/NEXT_PUBLIC_SITE_URL/);
    });
  });

  describe("off Vercel", () => {
    it("falls back to localhost outside production (next dev, tests)", () => {
      vi.stubEnv("NODE_ENV", "development");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
      vi.stubEnv("NODE_ENV", "test");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    });

    it("ignores a stray VERCEL_URL when VERCEL_ENV is not preview or development", () => {
      vi.stubEnv("VERCEL_URL", "somewhere.vercel.app");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    });

    it("is required in a production build, so canonical links can never point at localhost", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow(
        /Missing required environment variable NEXT_PUBLIC_SITE_URL.*https:\/\/www\.terratechbharat\.com/,
      );
    });
  });

  describe("rejects a value that is not a full http(s) URL, with a helpful message", () => {
    it.each([
      ["a bare domain", "www.terratechbharat.com"],
      ["a host and port without a scheme", "localhost:3000"],
      ["a domain and port without a scheme", "example.com:443"],
      ["another protocol", "ftp://example.com"],
      ["a mailto address", "mailto:hello@example.com"],
    ])("%s", (_label, value) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow(
        /NEXT_PUBLIC_SITE_URL must be a full URL starting with http:\/\/ or https:\/\//,
      );
    });

    it("quotes the offending value", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "example.com:443");
      expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow('(got "example.com:443")');
    });
  });
});

describe("env.isVercelPreview", () => {
  it("is true only for a Vercel Preview deployment", () => {
    expect(env.isVercelPreview()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(env.isVercelPreview()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "development");
    expect(env.isVercelPreview()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(env.isVercelPreview()).toBe(true);
  });
});

describe("env.devFallbacksAllowed", () => {
  it("is on only when ALLOW_DEV_FALLBACKS is exactly 'true'", () => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    expect(env.devFallbacksAllowed()).toBe(true);
    for (const value of ["", "1", "TRUE", "True", "yes", "false", " true"]) {
      vi.stubEnv("ALLOW_DEV_FALLBACKS", value);
      expect(env.devFallbacksAllowed()).toBe(false);
    }
  });

  it("is off on a Vercel Production deployment even with the flag, but not on Preview", () => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(env.devFallbacksAllowed()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(env.devFallbacksAllowed()).toBe(true);
  });
});

describe("robots.txt rules", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.terratechbharat.com");
  });

  it("allows the site, blocks admin and api, and names the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
      sitemap: "https://www.terratechbharat.com/sitemap.xml",
    });
  });

  it("blocks everything on a Vercel Preview, and offers no sitemap", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("is unchanged on Vercel Production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(robots()).toMatchObject({ rules: { allow: "/" }, sitemap: "https://www.terratechbharat.com/sitemap.xml" });
  });
});

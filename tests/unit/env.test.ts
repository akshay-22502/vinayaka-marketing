import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import { env } from "@/lib/env";

// Each case starts from a clean slate (a local, non-Vercel run) and sets only what it needs.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_GA_MEASUREMENT_ID", "");
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

describe("env.NEXT_PUBLIC_TURNSTILE_SITE_KEY", () => {
  it("is the trimmed key when set", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "  0x4AAAAAAA-site-key ");
    expect(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBe("0x4AAAAAAA-site-key");
  });

  it("is undefined when unset or blank, so the quote form shows no captcha", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "   ");
    expect(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY).toBeUndefined();
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

  it("is off on any Vercel deployment even with the flag (Production, Preview and `vercel dev`)", () => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    vi.stubEnv("VERCEL", "1"); // set by Vercel on every deployment
    for (const vercelEnv of ["production", "preview", "development", ""]) {
      vi.stubEnv("VERCEL_ENV", vercelEnv);
      expect(env.devFallbacksAllowed()).toBe(false);
    }
  });

  it("stays on locally, where Vercel's variables are not set (npm run dev, the E2E `next start`)", () => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    vi.stubEnv("NODE_ENV", "production");
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

describe("env.GA_MEASUREMENT_ID", () => {
  it("is undefined when unset or blank, so the tag stays off", () => {
    expect(env.GA_MEASUREMENT_ID).toBeUndefined();
    vi.stubEnv("NEXT_GA_MEASUREMENT_ID", "   ");
    expect(env.GA_MEASUREMENT_ID).toBeUndefined();
  });

  it("returns a GA4 ID, trimmed and upper-cased", () => {
    vi.stubEnv("NEXT_GA_MEASUREMENT_ID", " g-abc123xyz9 ");
    expect(env.GA_MEASUREMENT_ID).toBe("G-ABC123XYZ9");
  });

  it("ignores anything that is not a GA4 ID (an old UA- ID, a pasted snippet)", () => {
    for (const value of ["UA-12345-1", "G-", "ABC123", "G-ABC123');alert(1);//", "<script>"]) {
      vi.stubEnv("NEXT_GA_MEASUREMENT_ID", value);
      expect(env.GA_MEASUREMENT_ID, value).toBeUndefined();
    }
  });

  it("is off on Vercel Preview deployments, on in Production", () => {
    vi.stubEnv("NEXT_GA_MEASUREMENT_ID", "G-ABC123XYZ9");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(env.GA_MEASUREMENT_ID).toBeUndefined();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(env.GA_MEASUREMENT_ID).toBe("G-ABC123XYZ9");
  });
});

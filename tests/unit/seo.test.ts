import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/lib/env";
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  metaDescription,
  organizationJsonLd,
  pageMetadata,
  productJsonLd,
  serializeJsonLd,
} from "@/lib/seo";

// "\" + "u003c": the six characters a JSON escape for "<" is made of.
const ESCAPED_LT = `${String.fromCharCode(92)}u003c`;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.terratechbharat.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serializeJsonLd", () => {
  it("cannot be broken out of its script tag by admin-entered text", () => {
    const hostile = {
      name: 'Geogrid </script><script>alert("x")</script>',
      summary: "<img src=x onerror=alert(1)> & more",
    };
    const output = serializeJsonLd(hostile);

    expect(output).not.toContain("<");
    expect(output).not.toContain(">");
    expect(output).not.toContain("&");
    expect(output).toContain(`Geogrid ${ESCAPED_LT}/script`);
    // The escapes are plain JSON: a search engine reads the original text back.
    expect(JSON.parse(output)).toEqual(hostile);
  });

  it("escapes the JavaScript line separators too", () => {
    const text = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`;
    const output = serializeJsonLd({ text });
    expect(output).not.toContain(String.fromCharCode(0x2028));
    expect(output).not.toContain(String.fromCharCode(0x2029));
    expect(JSON.parse(output)).toEqual({ text });
  });

  it("leaves ordinary text untouched", () => {
    expect(serializeJsonLd({ name: "PP Biaxial Geogrid", n: 2 })).toBe('{"name":"PP Biaxial Geogrid","n":2}');
  });
});

describe("productJsonLd", () => {
  const product = {
    name: "PP Biaxial Geogrid",
    summary: "Punched and drawn polypropylene grid.",
    image: "https://cdn.example.com/geogrid.jpg",
    category: "Geogrid",
    path: "/products/geogrid/pp-biaxial-geogrid",
  };

  it("describes the product with the brand, category and absolute URL", () => {
    expect(productJsonLd(product)).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "PP Biaxial Geogrid",
      description: "Punched and drawn polypropylene grid.",
      image: "https://cdn.example.com/geogrid.jpg",
      brand: { "@type": "Brand", name: "TerraTechBharat" },
      category: "Geogrid",
      url: "https://www.terratechbharat.com/products/geogrid/pp-biaxial-geogrid",
    });
  });

  it("never has offers (the site shows no prices)", () => {
    const data = productJsonLd(product);
    expect(data).not.toHaveProperty("offers");
    expect(serializeJsonLd(data)).not.toMatch(/offers|price/i);
  });

  it("leaves out the image and description when there are none", () => {
    const data = productJsonLd({ name: "X", summary: "", image: null, path: "/products/a/x" });
    expect(data).not.toHaveProperty("image");
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("category");
  });
});

describe("organizationJsonLd", () => {
  it("has the name, site URL and logo, and is small", () => {
    expect(organizationJsonLd()).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "TerraTechBharat",
      url: "https://www.terratechbharat.com",
      logo: "https://www.terratechbharat.com/brand/logo.png",
    });
  });
});

describe("absoluteUrl", () => {
  it("prefixes the site URL", () => {
    expect(absoluteUrl("/products")).toBe("https://www.terratechbharat.com/products");
    // The home page has no trailing slash, matching the canonical link Next writes.
    expect(absoluteUrl("/")).toBe("https://www.terratechbharat.com");
  });

  it("adds a missing leading slash and keeps absolute addresses", () => {
    expect(absoluteUrl("about")).toBe("https://www.terratechbharat.com/about");
    expect(absoluteUrl("https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
  });
});

describe("env.NEXT_PUBLIC_SITE_URL", () => {
  it("drops a trailing slash or path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.terratechbharat.com/");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://www.terratechbharat.com");
    expect(absoluteUrl("/about")).toBe("https://www.terratechbharat.com/about");
  });

  it("falls back to localhost outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("is required in production, so a build cannot point canonical links at localhost", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("rejects a value that is not a URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "www.terratechbharat.com");
    expect(() => env.NEXT_PUBLIC_SITE_URL).toThrow(/full URL/);
  });
});

describe("metaDescription", () => {
  it("returns undefined for empty text, so no empty tag is emitted", () => {
    expect(metaDescription("")).toBeUndefined();
    expect(metaDescription("   \n ")).toBeUndefined();
    expect(metaDescription(null)).toBeUndefined();
    expect(metaDescription(undefined)).toBeUndefined();
  });

  it("collapses whitespace and keeps short text whole", () => {
    expect(metaDescription("  Roads   and\npavements ")).toBe("Roads and pavements");
  });

  it("cuts long text at a word boundary with an ellipsis, within the limit", () => {
    const text = "Polymer grids that reinforce soil and aggregate. ".repeat(10);
    const result = metaDescription(text)!;
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
    const kept = result.slice(0, -1);
    expect(text.startsWith(kept)).toBe(true);
    // Not cut mid-word: what was dropped starts at a space or punctuation mark.
    expect(text.slice(kept.length)).toMatch(/^[\s,.;:–—-]/);
  });

  it("hard-cuts text that has no spaces to cut at", () => {
    const result = metaDescription("x".repeat(400))!;
    expect(result).toHaveLength(160);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("pageMetadata", () => {
  it("sets title, description, canonical and Open Graph tags from one place", () => {
    const meta = pageMetadata({ title: "Geogrid", description: "Polymer grids.", path: "/products/geogrid" });

    expect(meta.title).toBe("Geogrid");
    expect(meta.description).toBe("Polymer grids.");
    expect(meta.alternates?.canonical).toBe("/products/geogrid");
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: "TerraTechBharat",
      url: "/products/geogrid",
      title: "Geogrid",
      description: "Polymer grids.",
      images: [DEFAULT_OG_IMAGE],
    });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "Geogrid" });
  });

  it("uses a photo for the preview when there is one", () => {
    const meta = pageMetadata({
      title: "Geogrid",
      path: "/products/geogrid",
      image: "https://cdn.example.com/geogrid.jpg",
    });
    expect(meta.openGraph?.images).toEqual([{ url: "https://cdn.example.com/geogrid.jpg", alt: "Geogrid" }]);
  });

  it("emits no description tag when there is none, but still has an Open Graph description", () => {
    const meta = pageMetadata({ title: "Railways", description: undefined, path: "/applications/railways" });
    expect(meta).not.toHaveProperty("description");
    expect(meta.openGraph).toMatchObject({ description: DEFAULT_DESCRIPTION });
  });

  it("keeps an absolute title as written, and uses it for Open Graph", () => {
    const meta = pageMetadata({ title: { absolute: "TerraTechBharat | Tagline" }, path: "/" });
    expect(meta.title).toEqual({ absolute: "TerraTechBharat | Tagline" });
    expect(meta.openGraph).toMatchObject({ title: "TerraTechBharat | Tagline" });
  });
});

import { describe, expect, it } from "vitest";
import { slugify, truncateSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates a product name", () => {
    expect(slugify("PP Biaxial Geogrid BX-1515")).toBe(
      "pp-biaxial-geogrid-bx-1515",
    );
  });

  it("trims and collapses punctuation and whitespace", () => {
    expect(slugify("  HDPE / LLDPE  ")).toBe("hdpe-lldpe");
  });

  it("strips diacritics", () => {
    expect(slugify("Géotextile")).toBe("geotextile");
  });
});

describe("truncateSlug", () => {
  it("leaves a slug that fits as it is", () => {
    expect(truncateSlug("pp-biaxial-geogrid", 100)).toBe("pp-biaxial-geogrid");
    expect(truncateSlug("a".repeat(100), 100)).toHaveLength(100);
  });

  it("cuts a long slug at the last hyphen that fits, so no word is cut in half", () => {
    const slug = Array.from({ length: 40 }, (_, i) => `word${i}`).join("-");
    const cut = truncateSlug(slug, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(slug.startsWith(`${cut}-`)).toBe(true);
    expect(cut.endsWith("-")).toBe(false);
  });

  it("never ends with a hyphen, also when the cut falls exactly on one", () => {
    // 'aaaa-bbbb' cut to 5 characters is 'aaaa-': the hyphen has to go.
    expect(truncateSlug("aaaa-bbbb", 5)).toBe("aaaa");
    // The 101st character is the hyphen: the first 100 are a whole word already.
    expect(truncateSlug(`${"a".repeat(100)}-b`, 100)).toBe("a".repeat(100));
  });

  it("cuts a single very long word at the limit", () => {
    expect(truncateSlug("a".repeat(150), 100)).toBe("a".repeat(100));
  });

  it("returns an empty string for an empty slug", () => {
    expect(truncateSlug("", 100)).toBe("");
  });
});

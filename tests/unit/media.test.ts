import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_PLACEHOLDER, categoryPlaceholder, mediaOr } from "@/lib/media";

describe("categoryPlaceholder", () => {
  it("uses the placeholder named after the category slug", () => {
    expect(categoryPlaceholder("geogrid")).toBe("/placeholders/geogrid.svg");
    expect(categoryPlaceholder("geomembrane")).toBe("/placeholders/geomembrane.svg");
    expect(categoryPlaceholder("geotextile")).toBe("/placeholders/geotextile.svg");
    expect(categoryPlaceholder("geocell")).toBe("/placeholders/geocell.svg");
  });

  it("falls back to the generic placeholder for a category added later", () => {
    expect(categoryPlaceholder("geocomposite")).toBe(APPLICATION_PLACEHOLDER);
  });
});

describe("mediaOr", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the public URL of a stored file", () => {
    expect(mediaOr("products/a.jpg", "/placeholders/geogrid.svg")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/public-media/products/a.jpg",
    );
  });

  it("returns the fallback when there is no file", () => {
    expect(mediaOr(null, "/placeholders/geogrid.svg")).toBe("/placeholders/geogrid.svg");
  });
});

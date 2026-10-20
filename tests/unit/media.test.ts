import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPLICATION_PLACEHOLDER,
  applicationPlaceholder,
  categoryPlaceholder,
  mediaOr,
  productPlaceholder,
} from "@/lib/media";

describe("categoryPlaceholder", () => {
  it("uses the render named after the category slug", () => {
    expect(categoryPlaceholder("geogrid")).toBe("/images/categories/geogrid.webp");
    expect(categoryPlaceholder("geomembrane")).toBe("/images/categories/geomembrane.webp");
    expect(categoryPlaceholder("geotextile")).toBe("/images/categories/geotextile.webp");
    expect(categoryPlaceholder("geocell")).toBe("/images/categories/geocell.webp");
  });

  it("falls back to the generic drawing for a category added later", () => {
    expect(categoryPlaceholder("geocomposite")).toBe(APPLICATION_PLACEHOLDER);
  });
});

describe("productPlaceholder", () => {
  it("uses the render named after the product slug", () => {
    expect(productPlaceholder("pp-biaxial-geogrid", "geogrid")).toBe("/images/products/pp-biaxial-geogrid.webp");
    expect(productPlaceholder("hdpe-geocell", "geocell")).toBe("/images/products/hdpe-geocell.webp");
  });

  it("falls back to the category render for a product added or renamed later", () => {
    expect(productPlaceholder("pp-triaxial-geogrid", "geogrid")).toBe("/images/categories/geogrid.webp");
  });

  it("falls back to the generic drawing when neither has a render", () => {
    expect(productPlaceholder("drain-board", "geocomposite")).toBe(APPLICATION_PLACEHOLDER);
  });
});

describe("applicationPlaceholder", () => {
  it("uses the drawing named after the application slug", () => {
    expect(applicationPlaceholder("railways")).toBe("/images/applications/railways.webp");
    expect(applicationPlaceholder("ponds-and-canals")).toBe("/images/applications/ponds-and-canals.webp");
  });

  it("falls back to the generic drawing for an application added later", () => {
    expect(applicationPlaceholder("tunnels")).toBe(APPLICATION_PLACEHOLDER);
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
    expect(mediaOr("products/a.jpg", "/images/categories/geogrid.webp")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/public-media/products/a.jpg",
    );
  });

  it("returns the fallback when there is no file", () => {
    expect(mediaOr(null, "/images/categories/geogrid.webp")).toBe("/images/categories/geogrid.webp");
  });
});

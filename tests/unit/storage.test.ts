import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicMediaUrl } from "@/lib/storage";

describe("publicMediaUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the public-media URL for a storage path", () => {
    expect(publicMediaUrl("products/geogrid/bx1515.jpg")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/public-media/products/geogrid/bx1515.jpg",
    );
  });

  it("returns null when there is no path", () => {
    expect(publicMediaUrl(null)).toBeNull();
    expect(publicMediaUrl("")).toBeNull();
  });

  it("copes with a trailing slash on the base URL and a leading slash on the path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co/");
    expect(publicMediaUrl("/a/b.png")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/public-media/a/b.png",
    );
  });

  it("encodes characters that are not safe in a URL, keeping the folder slashes", () => {
    expect(publicMediaUrl("datasheets/PP Grid #1.pdf")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/public-media/datasheets/PP%20Grid%20%231.pdf",
    );
  });

  it("fails clearly when the Supabase URL is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => publicMediaUrl("a.png")).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});

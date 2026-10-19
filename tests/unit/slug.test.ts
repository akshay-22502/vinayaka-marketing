import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

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

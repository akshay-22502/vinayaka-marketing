import { describe, expect, it } from "vitest";
import {
  CATEGORY_GONE_MESSAGE,
  CATEGORY_HAS_PRODUCTS_MESSAGE,
  FORM_ERROR,
  NOT_FOUND_MESSAGE,
  SLUG_TAKEN_MESSAGE,
  fromPgError,
} from "@/lib/admin/action-result";
import {
  SLUG_EMPTY_MESSAGE,
  SLUG_INVALID_MESSAGE,
  applicationSchema,
  categorySchema,
  certificationSchema,
  parseForm,
  parseInput,
  productSchema,
  projectSchema,
  PUBLISH_CONFIRM_FIELD,
  PUBLISH_NOTE_MESSAGE,
  hasDatasheetReminder,
} from "@/lib/admin/schemas";

// The admin forms post plain strings; these are the validation rules behind them.

const PRODUCT_ID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";
const OTHER_PRODUCT_ID = "7c1d9a44-2f0e-4b8a-a3d5-1e9c6b7f8a20";
const CATEGORY_ID = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
const APPLICATION_ID = "5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9";
const OTHER_APPLICATION_ID = "6b7c8d9e-0f1a-4b2c-83d4-e5f6a7b8c9d0";

function ok<T>(result: { ok: true; data: T } | { ok: false; errors: Record<string, string> }): T {
  if (!result.ok) throw new Error(`Expected valid input, got errors: ${JSON.stringify(result.errors)}`);
  return result.data;
}

function errorsOf(result: { ok: boolean; errors?: Record<string, string> }): Record<string, string> {
  if (result.ok) throw new Error("Expected invalid input");
  return result.errors ?? {};
}

describe("fromPgError", () => {
  it("maps a duplicate slug on the categories table to a slug field error (Review Focus 4)", () => {
    expect(fromPgError({ code: "23505", message: "...categories_slug_key..." })).toEqual({
      ok: false,
      errors: { slug: "This URL slug is already used" },
    });
  });

  it("maps the real Postgres message for each table with a slug", () => {
    for (const table of ["categories", "products", "applications", "projects"]) {
      const result = fromPgError({
        code: "23505",
        message: `duplicate key value violates unique constraint "${table}_slug_key"`,
        details: "Key (slug)=(geogrid) already exists.",
      });
      expect(result, table).toEqual({ ok: false, errors: { slug: SLUG_TAKEN_MESSAGE } });
    }
  });

  it("uses the constraint name when the driver reports it separately", () => {
    expect(fromPgError({ code: "23505", message: "duplicate key", constraint: "applications_slug_key" })).toEqual({
      ok: false,
      errors: { slug: SLUG_TAKEN_MESSAGE },
    });
  });

  it("maps deleting a category that still has products to a friendly form message (Ruling R13)", () => {
    const result = fromPgError({
      code: "23503",
      message:
        'update or delete on table "categories" violates foreign key constraint "products_category_id_fkey" on table "products"',
      details: 'Key (id)=(1) is still referenced from table "products".',
    });
    expect(result).toEqual({
      ok: false,
      errors: { [FORM_ERROR]: "This category still has products. Move or delete them first." },
    });
    expect(CATEGORY_HAS_PRODUCTS_MESSAGE).toBe("This category still has products. Move or delete them first.");
  });

  it("explains other foreign key problems without leaking database text", () => {
    const result = fromPgError({
      code: "23503",
      message: 'insert or update on table "project_products" violates foreign key constraint "project_products_product_id_fkey"',
    });
    expect(result.ok).toBe(false);
    expect(result.errors[FORM_ERROR]).toMatch(/no longer exists|still in use/i);
    expect(result.errors[FORM_ERROR]).not.toMatch(/violates|constraint|project_products/);
  });

  it("does not call a non-slug unique violation a slug problem", () => {
    const result = fromPgError({ code: "23505", message: 'duplicate key value violates unique constraint "project_products_pkey"' });
    expect(result.errors.slug).toBeUndefined();
    expect(result.errors[FORM_ERROR]).toBeTruthy();
  });

  it("turns anything else into a generic form message and hides the database text", () => {
    const result = fromPgError({ code: "XX000", message: "relation public.secret_table exploded" });
    expect(result.ok).toBe(false);
    expect(result.errors[FORM_ERROR]).toMatch(/could not save/i);
    expect(JSON.stringify(result)).not.toContain("secret_table");
    expect(fromPgError(undefined).ok).toBe(false);
    expect(fromPgError("boom").ok).toBe(false);
  });
});

describe("fromPgError: a product whose category was deleted in the meantime", () => {
  it("puts the message on the category field, and does not say the category still has products", () => {
    const result = fromPgError({
      code: "23503",
      message: 'insert or update on table "products" violates foreign key constraint "products_category_id_fkey"',
      details: 'Key (category_id)=(abc) is not present in table "categories".',
    });
    expect(result).toEqual({ ok: false, errors: { category_id: CATEGORY_GONE_MESSAGE } });
  });
});

describe("fromPgError: spec table (RPC) errors", () => {
  it("maps 'product not found' (P0002) to the not-found message", () => {
    expect(fromPgError({ code: "P0002", message: "Product 123 not found" })).toEqual({
      ok: false,
      errors: { [FORM_ERROR]: NOT_FOUND_MESSAGE },
    });
  });

  it("maps a refusal for a non-admin (42501) to a permission message without database text", () => {
    const result = fromPgError({ code: "42501", message: "Only admins can save a spec table" });
    expect(result.errors[FORM_ERROR]).toMatch(/permission/i);
    expect(JSON.stringify(result)).not.toContain("Only admins");
  });

  it("maps invalid input (22023) to a message about the values, without database text", () => {
    const result = fromPgError({ code: "22023", message: 'Row "Strength" has 3 values but there are 4 models' });
    expect(result.errors[FORM_ERROR]).toMatch(/not valid/i);
    expect(JSON.stringify(result)).not.toContain("Strength");
  });
});

describe("slug rules", () => {
  const base = { name: "Geo Textile", slug: "", intro: "", image_path: "", sort_order: "", published: undefined };

  it("derives a blank slug from the name", () => {
    expect(ok(parseInput(categorySchema, base)).slug).toBe("geo-textile");
    expect(ok(parseInput(categorySchema, { ...base, slug: "   " })).slug).toBe("geo-textile");
    expect(ok(parseInput(categorySchema, { name: "Géotextile / Fabric", slug: "" })).slug).toBe("geotextile-fabric");
  });

  it("keeps a slug the admin typed", () => {
    expect(ok(parseInput(categorySchema, { ...base, slug: "fabrics-2" })).slug).toBe("fabrics-2");
    expect(ok(parseInput(categorySchema, { ...base, slug: " fabrics " })).slug).toBe("fabrics");
  });

  it("derives an application slug from its name and a project slug from its title", () => {
    expect(ok(parseInput(applicationSchema, { name: "Roads & Pavements" })).slug).toBe("roads-pavements");
    expect(ok(parseInput(projectSchema, { title: "Delhi Metro Phase 4", country: "IN" })).slug).toBe("delhi-metro-phase-4");
  });

  it("asks for a slug when the name has no Latin letters (slugify returns an empty string)", () => {
    for (const name of ["भू-वस्त्र", "جيوتكستايل", "!!!"]) {
      const result = parseInput(categorySchema, { name, slug: "" });
      expect(errorsOf(result), name).toEqual({ slug: SLUG_EMPTY_MESSAGE });
    }
    expect(SLUG_EMPTY_MESSAGE).toBe("Enter a URL slug using letters a–z, numbers and hyphens");

    expect(errorsOf(parseInput(applicationSchema, { name: "सड़कें" })).slug).toBe(SLUG_EMPTY_MESSAGE);
    expect(errorsOf(parseInput(projectSchema, { title: "مشروع", country: "AE" })).slug).toBe(SLUG_EMPTY_MESSAGE);
  });

  it("accepts a typed slug even when the name is not Latin", () => {
    expect(ok(parseInput(categorySchema, { name: "भू-वस्त्र", slug: "geotextile-hindi" })).slug).toBe("geotextile-hindi");
  });

  it("rejects slugs that are not lowercase letters, numbers and single hyphens", () => {
    for (const slug of ["Geo Grid", "GEOGRID", "geo_grid", "-geo", "geo-", "geo--grid", "geo/grid", "भू", "geo.grid"]) {
      expect(errorsOf(parseInput(categorySchema, { name: "Geo", slug })), slug).toEqual({ slug: SLUG_INVALID_MESSAGE });
    }
  });

  it("rejects a typed slug over 100 characters", () => {
    const longSlug = "a".repeat(101);
    expect(errorsOf(parseInput(categorySchema, { name: "Geo", slug: longSlug })).slug).toBe(SLUG_INVALID_MESSAGE);
    expect(ok(parseInput(categorySchema, { name: "Geo", slug: "a".repeat(100) })).slug).toHaveLength(100);
  });

  it("truncates a slug derived from a long name at a hyphen, never ending in a hyphen (Task 11 review)", () => {
    const longName = "word ".repeat(24).trim(); // 119 characters (the name limit is 120): would derive a 119-character slug
    const slug = ok(parseInput(categorySchema, { name: longName, slug: "" })).slug;
    expect(slug.length).toBeLessThanOrEqual(100);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(longName.replace(/ /g, "-")).toContain(slug);
    // 'word-word-...': 20 words and 19 hyphens are 99 characters; the 21st word would not fit.
    expect(slug).toBe(Array(20).fill("word").join("-"));
  });

  it("truncates derived slugs for applications, projects and products as well", () => {
    const long = `${"Polypropylene Geosynthetic Reinforcement Grid ".repeat(2)}Polypropylene Geosynthetic`; // 118 characters
    const slugs = [
      ok(parseInput(applicationSchema, { name: long })).slug,
      ok(parseInput(projectSchema, { title: long, country: "IN" })).slug,
      ok(parseInput(productSchema, { name: long, category_id: CATEGORY_ID })).slug,
    ];
    for (const slug of slugs) {
      expect(slug.length).toBeLessThanOrEqual(100);
      expect(slug.endsWith("-")).toBe(false);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(slug.startsWith("polypropylene-geosynthetic-reinforcement-grid-")).toBe(true);
    }
  });

  it("cuts one very long unbroken word at 100 characters", () => {
    expect(ok(parseInput(categorySchema, { name: "a".repeat(120), slug: "" })).slug).toBe("a".repeat(100));
  });

  it("reports a bad slug together with other field errors", () => {
    const errors = errorsOf(parseInput(categorySchema, { name: "Geo", slug: "Bad Slug", sort_order: "abc" }));
    expect(errors.slug).toBe(SLUG_INVALID_MESSAGE);
    expect(errors.sort_order).toBeTruthy();
  });
});

describe("categorySchema", () => {
  it("produces a database row with defaults", () => {
    expect(ok(parseInput(categorySchema, { name: "  Geogrid  " }))).toEqual({
      name: "Geogrid",
      slug: "geogrid",
      intro: "",
      image_path: null,
      sort_order: 0,
      published: false,
    });
  });

  it("requires a name", () => {
    expect(errorsOf(parseInput(categorySchema, { name: "   " })).name).toBe("Enter a name");
    expect(errorsOf(parseInput(categorySchema, {})).name).toBe("Enter a name");
  });

  it("limits the name and intro length", () => {
    expect(errorsOf(parseInput(categorySchema, { name: "n".repeat(121), slug: "n" })).name).toMatch(/120/);
    expect(errorsOf(parseInput(categorySchema, { name: "n", intro: "i".repeat(2001) })).intro).toMatch(/2000/);
  });

  it("reads sort order and the published checkbox", () => {
    const row = ok(parseInput(categorySchema, { name: "A", sort_order: " 7 ", published: "on" }));
    expect(row.sort_order).toBe(7);
    expect(row.published).toBe(true);
    expect(ok(parseInput(categorySchema, { name: "A", sort_order: "-3" })).sort_order).toBe(-3);
    expect(ok(parseInput(categorySchema, { name: "A", sort_order: "" })).sort_order).toBe(0);
    expect(ok(parseInput(categorySchema, { name: "A" })).published).toBe(false);
  });

  it("rejects a sort order that is not a whole number", () => {
    for (const sort_order of ["1.5", "abc", "1e3", "999999999999"]) {
      expect(errorsOf(parseInput(categorySchema, { name: "A", sort_order })).sort_order, sort_order).toBe("Enter a whole number");
    }
  });

  it("turns a blank image path into null and refuses paths that could escape the folder", () => {
    expect(ok(parseInput(categorySchema, { name: "A", image_path: "categories/abc-photo.jpg" })).image_path).toBe(
      "categories/abc-photo.jpg",
    );
    expect(ok(parseInput(categorySchema, { name: "A", image_path: "  " })).image_path).toBeNull();
    for (const image_path of ["../secret.png", "/etc/passwd", "a/../b.png", "http://x.test/a.png", "a b.png"]) {
      expect(errorsOf(parseInput(categorySchema, { name: "A", image_path })).image_path, image_path).toBeTruthy();
    }
  });

  it("ignores fields it does not know, so a crafted form cannot set other columns", () => {
    const row = ok(parseInput(categorySchema, { name: "A", id: "x", created_at: "2020-01-01", slug: "" }));
    expect(Object.keys(row).sort()).toEqual(["image_path", "intro", "name", "published", "slug", "sort_order"]);
  });
});

describe("applicationSchema", () => {
  it("produces a database row with the Markdown body", () => {
    expect(
      ok(parseInput(applicationSchema, { name: "Railways", summary: "Track bed", body: "## Heading\r\n\r\nText\r\nmore", published: "on" })),
    ).toEqual({
      name: "Railways",
      slug: "railways",
      summary: "Track bed",
      body: "## Heading\n\nText\nmore",
      image_path: null,
      sort_order: 0,
      published: true,
    });
  });

  it("limits the summary and body", () => {
    expect(errorsOf(parseInput(applicationSchema, { name: "A", summary: "s".repeat(501) })).summary).toMatch(/500/);
    expect(errorsOf(parseInput(applicationSchema, { name: "A", body: "b".repeat(20001) })).body).toMatch(/20000/);
  });
});

describe("certificationSchema", () => {
  it("produces a database row; a blank date and blank files are null", () => {
    expect(ok(parseInput(certificationSchema, { name: "ISO 9001", issuer: " Bureau Veritas ", valid_until: "" }))).toEqual({
      name: "ISO 9001",
      issuer: "Bureau Veritas",
      valid_until: null,
      file_path: null,
      image_path: null,
      sort_order: 0,
      published: false,
    });
  });

  it("has no slug", () => {
    expect(ok(parseInput(certificationSchema, { name: "ISO 9001" }))).not.toHaveProperty("slug");
  });

  it("requires a name", () => {
    expect(errorsOf(parseInput(certificationSchema, { name: "" })).name).toBe("Enter a name");
  });

  it("accepts real dates and refuses anything else", () => {
    expect(ok(parseInput(certificationSchema, { name: "A", valid_until: "2028-02-29" })).valid_until).toBe("2028-02-29");
    for (const valid_until of ["2027-02-30", "31/12/2027", "2027-13-01", "next year", "2027-1-1"]) {
      expect(errorsOf(parseInput(certificationSchema, { name: "A", valid_until })).valid_until, valid_until).toBe(
        "Enter a valid date",
      );
    }
  });

  it("keeps the PDF and image paths", () => {
    const row = ok(
      parseInput(certificationSchema, { name: "A", file_path: "certifications/1-cert.pdf", image_path: "certifications/2-seal.png" }),
    );
    expect(row.file_path).toBe("certifications/1-cert.pdf");
    expect(row.image_path).toBe("certifications/2-seal.png");
  });
});

describe("projectSchema", () => {
  const base = { title: "Delhi Metro", country: "IN" };

  it("produces a database row plus the linked product ids", () => {
    expect(
      ok(
        parseInput(projectSchema, {
          ...base,
          location: " Delhi ",
          summary: "Subgrade",
          body: "Text",
          images: ["projects/a-1.jpg", "projects/b-2.jpg"],
          product_ids: [PRODUCT_ID, OTHER_PRODUCT_ID],
          sort_order: "2",
          published: "on",
        }),
      ),
    ).toEqual({
      title: "Delhi Metro",
      slug: "delhi-metro",
      location: "Delhi",
      country: "IN",
      summary: "Subgrade",
      body: "Text",
      images: ["projects/a-1.jpg", "projects/b-2.jpg"],
      product_ids: [PRODUCT_ID, OTHER_PRODUCT_ID],
      sort_order: 2,
      published: true,
    });
  });

  it("requires a title and one of the two countries", () => {
    expect(errorsOf(parseInput(projectSchema, { country: "IN" })).title).toBe("Enter a title");
    expect(ok(parseInput(projectSchema, { ...base, country: "AE" })).country).toBe("AE");
    for (const country of ["", "US", "in", "IND"]) {
      expect(errorsOf(parseInput(projectSchema, { ...base, country })).country, country).toBe("Choose a country");
    }
  });

  it("accepts one image as a single string, and drops blank rows while keeping order", () => {
    expect(ok(parseInput(projectSchema, { ...base, images: "projects/a-1.jpg" })).images).toEqual(["projects/a-1.jpg"]);
    expect(ok(parseInput(projectSchema, { ...base, images: ["", "projects/a-1.jpg", "  ", "projects/b-2.jpg"] })).images).toEqual([
      "projects/a-1.jpg",
      "projects/b-2.jpg",
    ]);
    expect(ok(parseInput(projectSchema, base)).images).toEqual([]);
  });

  it("limits the number of images and refuses unsafe image paths", () => {
    const many = Array.from({ length: 21 }, (_, i) => `projects/${i}-x.jpg`);
    expect(errorsOf(parseInput(projectSchema, { ...base, images: many })).images).toMatch(/20/);
    expect(errorsOf(parseInput(projectSchema, { ...base, images: ["../x.jpg"] })).images).toBeTruthy();
  });

  it("accepts a single product id and removes duplicates", () => {
    expect(ok(parseInput(projectSchema, { ...base, product_ids: PRODUCT_ID })).product_ids).toEqual([PRODUCT_ID]);
    expect(ok(parseInput(projectSchema, { ...base, product_ids: [PRODUCT_ID, PRODUCT_ID] })).product_ids).toEqual([PRODUCT_ID]);
    expect(ok(parseInput(projectSchema, base)).product_ids).toEqual([]);
  });

  it("refuses product ids that are not ids", () => {
    expect(errorsOf(parseInput(projectSchema, { ...base, product_ids: ["1; drop table products"] })).product_ids).toBeTruthy();
  });
});

describe("parseForm", () => {
  it("reads a FormData the way a browser posts it, repeated fields included", () => {
    const form = new FormData();
    form.set("title", "Port expansion");
    form.set("slug", "");
    form.set("country", "AE");
    form.append("images", "projects/a-1.jpg");
    form.append("images", "projects/b-2.jpg");
    form.append("product_ids", PRODUCT_ID);
    form.set("published", "on");
    form.set("$ACTION_ID_abc", "");

    const data = ok(parseForm(projectSchema, form));
    expect(data.slug).toBe("port-expansion");
    expect(data.images).toEqual(["projects/a-1.jpg", "projects/b-2.jpg"]);
    expect(data.product_ids).toEqual([PRODUCT_ID]);
    expect(data.published).toBe(true);
  });

  it("returns one message per field", () => {
    const form = new FormData();
    form.set("name", "");
    form.set("sort_order", "x");
    const result = parseForm(categorySchema, form);
    expect(errorsOf(result)).toEqual({ name: "Enter a name", sort_order: "Enter a whole number" });
  });

  it("refuses a file where text is expected", () => {
    const form = new FormData();
    form.set("name", new File(["x"], "x.txt"));
    expect(errorsOf(parseForm(categorySchema, form)).name).toBeTruthy();
  });
});

describe("productSchema", () => {
  const base = { name: "PP Biaxial Geogrid", category_id: CATEGORY_ID };

  it("produces a database row plus the linked application ids and the publish confirmation", () => {
    expect(
      ok(
        parseInput(productSchema, {
          ...base,
          slug: "",
          summary: " Equal strength both ways. ",
          overview: "## Overview\r\nText",
          features: "Strong\r\n  UV stable  \n\n",
          images: ["products/a-1.png", "products/b-2.png"],
          datasheet_path: "products/c-3.pdf",
          application_ids: [APPLICATION_ID, OTHER_APPLICATION_ID],
          sort_order: "3",
          published: "on",
        }),
      ),
    ).toEqual({
      name: "PP Biaxial Geogrid",
      slug: "pp-biaxial-geogrid",
      category_id: CATEGORY_ID,
      summary: "Equal strength both ways.",
      overview: "## Overview\nText",
      features: ["Strong", "UV stable"],
      images: ["products/a-1.png", "products/b-2.png"],
      datasheet_path: "products/c-3.pdf",
      application_ids: [APPLICATION_ID, OTHER_APPLICATION_ID],
      confirm_unverified: false,
      sort_order: 3,
      published: true,
    });
  });

  it("has sensible defaults: draft, no features, images, datasheet or applications", () => {
    expect(ok(parseInput(productSchema, base))).toEqual({
      name: "PP Biaxial Geogrid",
      slug: "pp-biaxial-geogrid",
      category_id: CATEGORY_ID,
      summary: "",
      overview: "",
      features: [],
      images: [],
      datasheet_path: null,
      application_ids: [],
      confirm_unverified: false,
      sort_order: 0,
      published: false,
    });
  });

  it("requires a name and a category", () => {
    expect(errorsOf(parseInput(productSchema, { category_id: CATEGORY_ID })).name).toBe("Enter a name");
    expect(errorsOf(parseInput(productSchema, { name: "  ", category_id: CATEGORY_ID })).name).toBe("Enter a name");
    for (const category_id of [undefined, "", "  ", "geogrid", "1; drop table products"]) {
      expect(errorsOf(parseInput(productSchema, { name: "X", category_id })).category_id, String(category_id)).toBe(
        "Choose a category",
      );
    }
  });

  it("keeps a typed slug and checks it like every other slug", () => {
    expect(ok(parseInput(productSchema, { ...base, slug: " pp-grid " })).slug).toBe("pp-grid");
    expect(errorsOf(parseInput(productSchema, { ...base, slug: "PP Grid" })).slug).toBe(SLUG_INVALID_MESSAGE);
    expect(errorsOf(parseInput(productSchema, { name: "सड़कें", category_id: CATEGORY_ID })).slug).toBe(SLUG_EMPTY_MESSAGE);
  });

  it("reads features one per line: trimmed, blank lines dropped, any line-break style", () => {
    const features = (text: string) => ok(parseInput(productSchema, { ...base, features: text })).features;
    expect(features("a\nb")).toEqual(["a", "b"]);
    expect(features("a\r\n\r\n  b  \r\n")).toEqual(["a", "b"]);
    expect(features("")).toEqual([]);
    expect(features("   \n  ")).toEqual([]);
  });

  it("limits the number of features and their length", () => {
    const many = Array.from({ length: 31 }, (_, i) => `Feature ${i}`).join("\n");
    expect(errorsOf(parseInput(productSchema, { ...base, features: many })).features).toMatch(/30/);
    expect(errorsOf(parseInput(productSchema, { ...base, features: "f".repeat(301) })).features).toMatch(/300/);
    expect(ok(parseInput(productSchema, { ...base, features: "f".repeat(300) })).features).toHaveLength(1);
  });

  it("limits name, summary and overview", () => {
    expect(errorsOf(parseInput(productSchema, { name: "n".repeat(201), slug: "n", category_id: CATEGORY_ID })).name).toMatch(/200/);
    expect(errorsOf(parseInput(productSchema, { ...base, summary: "s".repeat(501) })).summary).toMatch(/500/);
    expect(errorsOf(parseInput(productSchema, { ...base, overview: "o".repeat(20001) })).overview).toMatch(/20000/);
  });

  it("accepts images as one string or several, drops blank rows, and refuses unsafe paths", () => {
    expect(ok(parseInput(productSchema, { ...base, images: "products/a-1.png" })).images).toEqual(["products/a-1.png"]);
    expect(ok(parseInput(productSchema, { ...base, images: ["", "products/a-1.png", " "] })).images).toEqual(["products/a-1.png"]);
    expect(errorsOf(parseInput(productSchema, { ...base, images: ["../x.png"] })).images).toBeTruthy();
    const many = Array.from({ length: 21 }, (_, i) => `products/${i}-x.png`);
    expect(errorsOf(parseInput(productSchema, { ...base, images: many })).images).toMatch(/20/);
    // The message is shared with projects, so it must not talk about projects.
    expect(errorsOf(parseInput(productSchema, { ...base, images: many })).images).not.toMatch(/project/i);
  });

  it("refuses an unsafe datasheet path; blank means none", () => {
    expect(ok(parseInput(productSchema, { ...base, datasheet_path: "" })).datasheet_path).toBeNull();
    expect(errorsOf(parseInput(productSchema, { ...base, datasheet_path: "/etc/passwd" })).datasheet_path).toBeTruthy();
  });

  it("accepts one application id or several, removes duplicates, and refuses anything that is not an id", () => {
    const ids = (application_ids: unknown) => ok(parseInput(productSchema, { ...base, application_ids })).application_ids;
    expect(ids(APPLICATION_ID)).toEqual([APPLICATION_ID]);
    expect(ids([APPLICATION_ID, APPLICATION_ID, OTHER_APPLICATION_ID])).toEqual([APPLICATION_ID, OTHER_APPLICATION_ID]);
    expect(ids(undefined)).toEqual([]);
    expect(errorsOf(parseInput(productSchema, { ...base, application_ids: ["roads"] })).application_ids).toBe(
      "Choose applications from the list",
    );
  });

  it("drops fields it does not know, so a hand-made request cannot set other columns", () => {
    const row = ok(parseInput(productSchema, { ...base, id: OTHER_PRODUCT_ID, created_at: "2020-01-01", updated_at: "x" }));
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("created_at");
    expect(row).not.toHaveProperty("updated_at");
  });

  it("parses a posted form (repeated fields become lists)", () => {
    const form = new FormData();
    form.append("name", "PP Biaxial Geogrid");
    form.append("category_id", CATEGORY_ID);
    form.append("images", "products/a-1.png");
    form.append("images", "products/b-2.png");
    form.append("application_ids", APPLICATION_ID);
    form.append("application_ids", OTHER_APPLICATION_ID);
    form.append("features", "One\r\nTwo");
    const data = ok(parseForm(productSchema, form));
    expect(data.images).toEqual(["products/a-1.png", "products/b-2.png"]);
    expect(data.application_ids).toEqual([APPLICATION_ID, OTHER_APPLICATION_ID]);
    expect(data.features).toEqual(["One", "Two"]);
  });
});

describe("the datasheet reminder in a published product's overview (Ruling R9)", () => {
  const REMINDER = "_Typical values. Confirm against the manufacturer's datasheet before publishing._";
  const overview = `Some text.\n\n${REMINDER}`;
  const base = { name: "PP Biaxial Geogrid", category_id: CATEGORY_ID, overview };

  it("recognises the seeded line, whatever the case, apostrophe or Markdown around it", () => {
    expect(hasDatasheetReminder(overview)).toBe(true);
    expect(hasDatasheetReminder("CONFIRM AGAINST THE MANUFACTURER'S DATASHEET BEFORE PUBLISHING")).toBe(true);
    expect(hasDatasheetReminder("Confirm against the manufacturer\u2019s datasheet before publishing.")).toBe(true);
    expect(hasDatasheetReminder("Confirm  against the   manufacturer's\ndatasheet before publishing")).toBe(true);
    expect(hasDatasheetReminder("Typical values. Contact us to confirm.")).toBe(false);
    expect(hasDatasheetReminder("")).toBe(false);
  });

  it("refuses to publish while the reminder is still there, with a message on the confirmation field", () => {
    const errors = errorsOf(parseInput(productSchema, { ...base, published: "on" }));
    expect(errors).toEqual({ [PUBLISH_CONFIRM_FIELD]: PUBLISH_NOTE_MESSAGE });
    expect(PUBLISH_NOTE_MESSAGE).toMatch(/datasheet/i);
    expect(PUBLISH_NOTE_MESSAGE).toMatch(/tick/i);
  });

  it("publishes once the admin confirms", () => {
    const row = ok(parseInput(productSchema, { ...base, published: "on", confirm_unverified: "on" }));
    expect(row.published).toBe(true);
    expect(row.overview).toContain("Confirm against the manufacturer's datasheet before publishing");
  });

  it("publishes without a confirmation once the line is deleted from the overview", () => {
    const row = ok(parseInput(productSchema, { ...base, overview: "Some text.", published: "on" }));
    expect(row.published).toBe(true);
  });

  it("does not ask when the product stays a draft", () => {
    expect(ok(parseInput(productSchema, base)).published).toBe(false);
    expect(ok(parseInput(productSchema, { ...base, published: undefined })).published).toBe(false);
  });

  it("still reports the other errors alongside", () => {
    const errors = errorsOf(parseInput(productSchema, { name: "", category_id: "", overview, published: "on" }));
    expect(errors.name).toBe("Enter a name");
    expect(errors.category_id).toBe("Choose a category");
    expect(errors[PUBLISH_CONFIRM_FIELD]).toBe(PUBLISH_NOTE_MESSAGE);
  });
});

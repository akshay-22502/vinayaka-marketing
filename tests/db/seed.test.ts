import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  APPLICATION_PLACEHOLDER,
  HERO_IMAGE,
  applicationPlaceholder,
  categoryPlaceholder,
  productPlaceholder,
} from "@/lib/media";
import { anonClient, serviceClient } from "./helpers";

// Checks the starter catalogue loaded by supabase/seed.sql (run by `npm run db:reset`).
// Fixture rows from other test files use their own unique slugs, so these checks
// look rows up by the seed's slugs instead of counting whole tables.

const service = serviceClient();
const anon = anonClient();

const REQUIRED_LAST_LINE =
  "_Typical values. Confirm against the manufacturer's datasheet before publishing._";

const categorySlugs = ["geogrid", "geomembrane", "geotextile", "geocell"];
const applicationSlugs = [
  "roads-and-pavements",
  "slopes-and-retaining-walls",
  "landfills-and-containment",
  "ponds-and-canals",
  "erosion-control",
  "railways",
];

const thicknessModels = ["0.5 mm", "0.75 mm", "1.0 mm", "1.5 mm", "2.0 mm"];

// What the brief requires of each product: its category, model columns and the
// test methods that must appear in its spec table.
const expected: Record<string, { category: string; models: string[]; methods: string[] }> = {
  "pp-biaxial-geogrid": {
    category: "geogrid",
    models: ["BX1515", "BX2020", "BX3030", "BX4040"],
    methods: ["ASTM D6637", "GRI-GG2", "ASTM D4218"],
  },
  "polyester-uniaxial-geogrid": {
    category: "geogrid",
    models: ["PET50", "PET80", "PET100", "PET150", "PET200"],
    methods: ["ISO 10319"],
  },
  "hdpe-geomembrane": {
    category: "geomembrane",
    models: thicknessModels,
    methods: ["ASTM D5199", "ASTM D1505", "ASTM D6693", "ASTM D1004", "ASTM D4833", "ASTM D4218"],
  },
  "lldpe-geomembrane": {
    category: "geomembrane",
    models: thicknessModels,
    methods: ["ASTM D5199", "ASTM D1505", "ASTM D6693", "ASTM D1004", "ASTM D4833", "ASTM D4218"],
  },
  "woven-geotextile": {
    category: "geotextile",
    models: ["WG100", "WG150", "WG200", "WG250", "WG300"],
    methods: ["ISO 9864", "ISO 10319", "ISO 12236", "ISO 12956", "ISO 11058"],
  },
  "nonwoven-geotextile": {
    category: "geotextile",
    models: ["NW150", "NW200", "NW300", "NW400", "NW500"],
    methods: ["ISO 9864", "ISO 10319", "ISO 12236", "ISO 12956", "ISO 11058"],
  },
  "hdpe-geocell": {
    category: "geocell",
    models: ["GC50", "GC75", "GC100", "GC150", "GC200"],
    methods: [],
  },
};
const productSlugs = Object.keys(expected);

type Product = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  overview: string;
  features: string[];
  images: string[];
  datasheet_path: string | null;
  published: boolean;
  category: { slug: string } | null;
};

type SpecProperty = {
  id: string;
  product_id: string;
  name: string;
  unit: string;
  test_method: string;
  sort_order: number;
  values: Array<{ model_id: string; value: string }>;
};

type SpecModel = { id: string; product_id: string; code: string; sort_order: number };

type Table = {
  models: SpecModel[];
  properties: SpecProperty[];
  /** Cell text for a property name and model code, or undefined when there is no such cell. */
  cell(propertyName: RegExp, modelCode: string): string | undefined;
};

let products: Product[];
const tables = new Map<string, Table>();

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data as T;
}

beforeAll(async () => {
  products = must(
    await service
      .from("products")
      .select(
        "id, slug, name, summary, overview, features, images, datasheet_path, published, category:categories(slug)",
      )
      .in("slug", productSlugs),
    "reading products",
  ) as unknown as Product[];

  const ids = products.map((p) => p.id);
  const models = must(
    await service.from("spec_models").select("id, product_id, code, sort_order").in("product_id", ids),
    "reading spec_models",
  ) as SpecModel[];
  const properties = must(
    await service
      .from("spec_properties")
      .select("id, product_id, name, unit, test_method, sort_order, values:spec_values(model_id, value)")
      .in("product_id", ids),
    "reading spec_properties",
  ) as SpecProperty[];

  for (const product of products) {
    const productModels = models
      .filter((m) => m.product_id === product.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const productProps = properties
      .filter((p) => p.product_id === product.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    tables.set(product.slug, {
      models: productModels,
      properties: productProps,
      cell(propertyName, modelCode) {
        const property = productProps.find((p) => propertyName.test(p.name));
        const model = productModels.find((m) => m.code === modelCode);
        if (!property || !model) return undefined;
        return property.values.find((v) => v.model_id === model.id)?.value;
      },
    });
  }
});

/** The seeded products; fails loudly when they are missing so loops over them cannot pass vacuously. */
function seeded(): Product[] {
  expect(products.map((p) => p.slug).sort()).toEqual([...productSlugs].sort());
  return products;
}

function table(slug: string): Table {
  const found = tables.get(slug);
  if (!found) throw new Error(`No spec table loaded for ${slug}`);
  return found;
}

describe("categories", () => {
  it("has the four published categories", async () => {
    const { data, error } = await service
      .from("categories")
      .select("slug, name, published, image_path, intro")
      .in("slug", categorySlugs)
      .order("sort_order");
    expect(error).toBeNull();
    expect(data?.map((c) => c.slug)).toEqual(categorySlugs);
    expect(data?.map((c) => c.name)).toEqual(["Geogrid", "Geomembrane", "Geotextile", "Geocell"]);
    for (const category of data ?? []) {
      expect(category.published, category.slug).toBe(true);
      expect(category.intro.length, category.slug).toBeGreaterThan(40);
      expect(category.image_path, category.slug).toBeNull();
    }
  });
});

describe("products", () => {
  it("has the seven starter products in the right categories", () => {
    expect(products.map((p) => p.slug).sort()).toEqual([...productSlugs].sort());
    for (const product of seeded()) {
      expect(product.category?.slug, product.slug).toBe(expected[product.slug].category);
    }
  });

  it("keeps every product unpublished and without media", () => {
    for (const product of seeded()) {
      expect(product.published, product.slug).toBe(false);
      expect(product.images, product.slug).toEqual([]);
      expect(product.datasheet_path, product.slug).toBeNull();
    }
  });

  it("has a spec table with at least 1 model and 4 properties per product", () => {
    for (const slug of productSlugs) {
      expect(table(slug).models.length, `${slug} models`).toBeGreaterThanOrEqual(1);
      expect(table(slug).properties.length, `${slug} properties`).toBeGreaterThanOrEqual(4);
    }
  });

  it("uses the model columns from the brief, in order", () => {
    for (const slug of productSlugs) {
      expect(table(slug).models.map((m) => m.code), slug).toEqual(expected[slug].models);
    }
  });

  it("names the required test methods and a roll or section size row", () => {
    for (const slug of productSlugs) {
      const methods = table(slug).properties.map((p) => p.test_method);
      for (const method of expected[slug].methods) {
        expect(methods, `${slug} should cite ${method}`).toContain(method);
      }
      expect(
        table(slug).properties.some((p) => /(roll|section) size/i.test(p.name)),
        `${slug} should have a roll or section size row`,
      ).toBe(true);
    }
  });

  it("fills every cell of every spec table", () => {
    for (const slug of productSlugs) {
      const { models, properties } = table(slug);
      for (const property of properties) {
        expect(property.values.length, `${slug} / ${property.name}`).toBe(models.length);
        for (const { value } of property.values) {
          expect(value.trim(), `${slug} / ${property.name}`).not.toBe("");
        }
      }
    }
  });

  it("has realistic spot values", () => {
    expect(table("pp-biaxial-geogrid").cell(/^Tensile strength, MD/i, "BX1515")).toBe("15 / 15");
    expect(table("pp-biaxial-geogrid").cell(/^Tensile strength, MD/i, "BX4040")).toBe("40 / 40");
    expect(table("polyester-uniaxial-geogrid").cell(/^Ultimate tensile/i, "PET150")).toBe("150");
    expect(table("hdpe-geomembrane").cell(/^Density/i, "1.5 mm")).toBe("≥ 0.940");
    expect(table("lldpe-geomembrane").cell(/^Density/i, "1.5 mm")).toBe("≤ 0.939");
    expect(table("woven-geotextile").cell(/^Mass per unit area/i, "WG200")).toBe("200");
    expect(table("nonwoven-geotextile").cell(/^Mass per unit area/i, "NW300")).toBe("300");
    expect(table("hdpe-geocell").cell(/^Cell depth/i, "GC100")).toBe("100");
  });

  it("writes an overview that ends with the typical-values line", () => {
    for (const product of seeded()) {
      expect(product.overview.endsWith(REQUIRED_LAST_LINE), product.slug).toBe(true);
      const body = product.overview.slice(0, -REQUIRED_LAST_LINE.length).trim();
      expect(body.length, `${product.slug} overview body`).toBeGreaterThan(150);
      expect(product.summary.length, `${product.slug} summary`).toBeGreaterThan(40);
      expect(product.features.length, `${product.slug} features`).toBeGreaterThanOrEqual(4);
      expect(product.features.length, `${product.slug} features`).toBeLessThanOrEqual(6);
    }
  });

  it("claims no standard compliance in any overview; the reminder line is the only caveat (Ruling R21)", () => {
    // The values are unverified until the owner checks them, and a standards sentence would stay on the
    // live page after the guarded reminder line is removed, so no overview names GRI-GM13/GM17.
    const products = seeded();
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.overview, product.slug).not.toMatch(/GM1[37]|follow(s)? (the )?GRI|typical figures/i);
    }
  });
});

describe("applications", () => {
  type AppRow = {
    slug: string;
    published: boolean;
    image_path: string | null;
    summary: string;
    body: string;
    products: Array<{ product: { slug: string } | null }>;
  };
  let applications: AppRow[];

  beforeAll(async () => {
    applications = must(
      await service
        .from("applications")
        .select("slug, published, image_path, summary, body, products:product_applications(product:products(slug))")
        .in("slug", applicationSlugs)
        .order("sort_order"),
      "reading applications",
    ) as unknown as AppRow[];
  });

  it("has the six published applications", () => {
    expect(applications.map((a) => a.slug)).toEqual(applicationSlugs);
    for (const application of applications) {
      expect(application.published, application.slug).toBe(true);
      expect(application.image_path, application.slug).toBeNull();
      expect(application.summary.length, `${application.slug} summary`).toBeGreaterThan(40);
      expect(application.body.split(/\n\s*\n/).length, `${application.slug} body paragraphs`).toBe(2);
    }
  });

  it("links every application to products and every product to an application", () => {
    const usedProducts = new Set<string>();
    for (const application of applications) {
      const slugs = application.products.map((link) => link.product?.slug ?? "");
      expect(slugs.length, application.slug).toBeGreaterThanOrEqual(2);
      for (const slug of slugs) {
        expect(productSlugs, `${application.slug} links an unknown product`).toContain(slug);
        usedProducts.add(slug);
      }
    }
    expect([...usedProducts].sort()).toEqual([...productSlugs].sort());
  });

  it("links roads and pavements to the PP biaxial geogrid", () => {
    const roads = applications.find((a) => a.slug === "roads-and-pavements");
    expect(roads?.products.map((link) => link.product?.slug)).toContain("pp-biaxial-geogrid");
  });
});

describe("content that must not be seeded", () => {
  it("has no certifications and no projects", async () => {
    const certifications = await service.from("certifications").select("id", { count: "exact", head: true });
    const projects = await service.from("projects").select("id", { count: "exact", head: true });
    expect(certifications.error).toBeNull();
    expect(projects.error).toBeNull();
    expect(certifications.count).toBe(0);
    expect(projects.count).toBe(0);
  });

  it("has no quote recipients and no quote requests", async () => {
    const recipients = await service.from("quote_recipients").select("country", { count: "exact", head: true });
    const requests = await service.from("quote_requests").select("id", { count: "exact", head: true });
    expect(recipients.count).toBe(0);
    expect(requests.count).toBe(0);
  });
});

describe("site settings", () => {
  it("has the tagline and bracketed office placeholders", async () => {
    const { data, error } = await service.from("site_settings").select("*").eq("id", 1).single();
    expect(error).toBeNull();
    expect(data?.tagline).toBe("Geosynthetic solutions for India and the UAE");
    expect(data?.hero_title.length).toBeGreaterThan(10);
    expect(data?.hero_text.length).toBeGreaterThan(60);
    expect(data?.about_md.length).toBeGreaterThan(200);
    expect(data).toMatchObject({
      india_address: "[India address]",
      india_phone: "[India phone]",
      india_whatsapp: "[India WhatsApp]",
      india_email: "[India email]",
      uae_address: "[UAE address]",
      uae_phone: "[UAE phone]",
      uae_whatsapp: "[UAE WhatsApp]",
      uae_email: "[UAE email]",
    });
  });
});

describe("what visitors can see", () => {
  it("shows the published categories and applications, but none of the draft products", async () => {
    const categories = await anon.from("categories").select("slug").in("slug", categorySlugs);
    expect(categories.data?.map((c) => c.slug).sort()).toEqual([...categorySlugs].sort());
    const applications = await anon.from("applications").select("slug").in("slug", applicationSlugs);
    expect(applications.data?.map((a) => a.slug).sort()).toEqual([...applicationSlugs].sort());
    const drafts = await anon.from("products").select("slug").in("slug", productSlugs);
    expect(drafts.data).toEqual([]);
  });
});

describe("seeded copy", () => {
  it("never mentions the old company name or any pricing", async () => {
    const [categories, applications, settings] = await Promise.all([
      service.from("categories").select("slug, name, intro").in("slug", categorySlugs),
      service.from("applications").select("slug, name, summary, body").in("slug", applicationSlugs),
      service
        .from("site_settings")
        .select(
          "tagline, hero_title, hero_text, about_md, india_address, india_phone, india_whatsapp, india_email, uae_address, uae_phone, uae_whatsapp, uae_email",
        )
        .eq("id", 1),
    ]);
    // Text columns only: ids are hex and could contain any three-letter run by chance.
    const text = JSON.stringify([
      categories.data,
      applications.data,
      settings.data,
      seeded().map(({ slug, name, summary, overview, features }) => ({ slug, name, summary, overview, features })),
      [...tables.values()].map((t) => [
        t.models.map((m) => m.code),
        t.properties.map((p) => [p.name, p.unit, p.test_method, p.values.map((v) => v.value)]),
      ]),
    ]);
    expect(text).not.toMatch(/vinayaka/i);
    // The catalogue shows no prices; the E2E suite fails on these strings too.
    expect(text).not.toMatch(/price|\u20B9|aed/i);
  });
});

describe("default images", () => {
  const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

  it("has a small navy and orange application.svg for projects and entries added later", () => {
    const file = `${publicDir}${APPLICATION_PLACEHOLDER}`;
    expect(existsSync(file), file).toBe(true);
    expect(statSync(file).size, "application.svg size").toBeLessThan(3 * 1024);
    const svg = readFileSync(file, "utf8");
    expect(svg.trimStart().startsWith("<svg")).toBe(true);
    expect(svg).toContain("#253F70");
    expect(svg).toContain("#D97A3A");
    expect(svg).not.toMatch(/<script|<image|href="https?:|onload=/i);
  });

  // Every starter category, product and application has its own render, so none falls back to the drawing.
  it.each([
    ...categorySlugs.map((slug) => [`category ${slug}`, categoryPlaceholder(slug)]),
    ...productSlugs.map((slug) => [`product ${slug}`, productPlaceholder(slug, expected[slug]!.category)]),
    ...applicationSlugs.map((slug) => [`application ${slug}`, applicationPlaceholder(slug)]),
    ["home banner", HERO_IMAGE],
  ])("has a webp render for the %s", (_, url) => {
    expect(url).toMatch(/^\/images\/[a-z-]+(\/[a-z-]+)?\.webp$/);
    const file = `${publicDir}${url}`;
    expect(existsSync(file), file).toBe(true);
    expect(statSync(file).size, `${url} size`).toBeLessThan(200 * 1024);
    const head = readFileSync(file).subarray(0, 12);
    expect(head.toString("ascii", 0, 4) + head.toString("ascii", 8, 12)).toBe("RIFFWEBP");
  });
});

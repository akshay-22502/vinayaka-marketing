import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getApplication,
  getApplications,
  getCategories,
  getCategoryWithProducts,
  getCertifications,
  getNavVisibility,
  getProduct,
  getProductOptions,
  getProject,
  getProjects,
  getSiteSettings,
  getSitemapEntries,
} from "@/lib/content/queries";
import { anonClient, serviceClient } from "./helpers";

// The public queries run as an anonymous visitor. All data here is made by the
// test (unique slugs) and deleted afterwards, so the seed rows are never touched:
// seed.test.ts relies on them staying as seeded.

const run = randomUUID().slice(0, 8);
const slug = (label: string) => `t4-${run}-${label}`;

const service = serviceClient();
const anon = anonClient();

// Rows created by these tests, deleted in reverse order afterwards.
const created: Array<{ table: string; id: string }> = [];

async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await service.from(table).insert(row).select("id").single();
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  created.push({ table, id: data.id });
  return data.id;
}

async function insertMany(table: string, rows: Record<string, unknown>[]): Promise<string[]> {
  const ids: string[] = [];
  for (const row of rows) ids.push(await insert(table, row));
  return ids;
}

/** Link-table rows have no id column; they go with the rows they point at (on delete cascade). */
async function link(table: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await service.from(table).insert(row);
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
}

const slugs = {
  catA: slug("cat-a"),
  catB: slug("cat-b"),
  catDraft: slug("cat-draft"),
  catToggle: slug("cat-toggle"),
  main: slug("prod-main"),
  second: slug("prod-second"),
  draft: slug("prod-draft"),
  inDraftCat: slug("prod-in-draft-cat"),
  toggle: slug("prod-toggle"),
  appPub: slug("app-pub"),
  appDraft: slug("app-draft"),
  projPub: slug("proj-pub"),
  projDraft: slug("proj-draft"),
};

const ids: Record<string, string> = {};

beforeAll(async () => {
  ids.catA = await insert("categories", {
    slug: slugs.catA,
    name: "Fixture A",
    intro: "Intro for A",
    image_path: "t4/cat-a.jpg",
    sort_order: 9001,
    published: true,
  });
  ids.catB = await insert("categories", {
    slug: slugs.catB,
    name: "Fixture B",
    sort_order: 9002,
    published: true,
  });
  ids.catDraft = await insert("categories", {
    slug: slugs.catDraft,
    name: "Fixture draft category",
    sort_order: 9003,
    published: false,
  });
  ids.catToggle = await insert("categories", {
    slug: slugs.catToggle,
    name: "Fixture toggled category",
    sort_order: 9004,
    published: true,
  });

  // Listed in sort order main (1), second (2); names deliberately sort the other way.
  ids.main = await insert("products", {
    slug: slugs.main,
    category_id: ids.catA,
    name: "Zebra grid",
    summary: "Main summary",
    overview: "## Overview\n\nBody text",
    features: ["Strong", "Light"],
    images: ["t4/main-1.jpg", "t4/main-2.jpg"],
    datasheet_path: "t4/main.pdf",
    sort_order: 1,
    published: true,
  });
  ids.second = await insert("products", {
    slug: slugs.second,
    category_id: ids.catA,
    name: "Alpha grid",
    sort_order: 2,
    published: true,
  });
  ids.draft = await insert("products", {
    slug: slugs.draft,
    category_id: ids.catA,
    name: "Draft grid",
    sort_order: 3,
    published: false,
  });
  // Published product in an unpublished category: RLS alone lets visitors read it.
  ids.inDraftCat = await insert("products", {
    slug: slugs.inDraftCat,
    category_id: ids.catDraft,
    name: "Hidden by category",
    published: true,
  });
  ids.toggle = await insert("products", {
    slug: slugs.toggle,
    category_id: ids.catToggle,
    name: "Toggled product",
    published: true,
  });

  // Spec table for the main product. Models and properties are inserted out of order.
  const [m3, m1, m2] = await insertMany("spec_models", [
    { product_id: ids.main, code: "T4-300", sort_order: 2 },
    { product_id: ids.main, code: "T4-100", sort_order: 0 },
    { product_id: ids.main, code: "T4-200", sort_order: 1 },
  ]);
  const [pMass, pStrength, pColour] = await insertMany("spec_properties", [
    { product_id: ids.main, name: "Mass", unit: "g/m²", test_method: "", sort_order: 1 },
    {
      product_id: ids.main,
      name: "Tensile strength",
      unit: "kN/m",
      test_method: "ASTM D6637",
      sort_order: 0,
    },
    { product_id: ids.main, name: "Colour", unit: "", test_method: "", sort_order: 2 },
  ]);
  await insertMany("spec_values", [
    { property_id: pStrength, model_id: m1, value: "15" },
    { property_id: pStrength, model_id: m2, value: "20" },
    { property_id: pStrength, model_id: m3, value: "30" },
    // Mass: T4-200 has no row at all and T4-300 is blank.
    { property_id: pMass, model_id: m1, value: "150" },
    { property_id: pMass, model_id: m3, value: "" },
    // Colour: only T4-200 has a value.
    { property_id: pColour, model_id: m2, value: "Black" },
  ]);

  ids.appPub = await insert("applications", {
    slug: slugs.appPub,
    name: "Fixture application",
    summary: "App summary",
    body: "App body",
    image_path: "t4/app.jpg",
    sort_order: 9001,
    published: true,
  });
  ids.appDraft = await insert("applications", {
    slug: slugs.appDraft,
    name: "Draft application",
    sort_order: 9002,
    published: false,
  });
  for (const product of [ids.main, ids.second, ids.draft, ids.inDraftCat, ids.toggle]) {
    await link("product_applications", { product_id: product, application_id: ids.appPub });
  }
  await link("product_applications", { product_id: ids.main, application_id: ids.appDraft });
});

afterAll(async () => {
  for (const { table, id } of [...created].reverse()) {
    await service.from(table).delete().eq("id", id);
  }
});

describe("getNavVisibility and getSitemapEntries on seed data", () => {
  // Runs before any certification or project fixture exists.
  it("hides certifications and projects when none are published", async () => {
    expect(await getNavVisibility()).toEqual({ certifications: false, projects: false });
  });

  it("leaves certifications and projects out of the sitemap", async () => {
    const paths = (await getSitemapEntries()).map((e) => e.path);
    expect(paths).not.toContain("/certifications");
    expect(paths.filter((p) => p.startsWith("/projects"))).toEqual([]);
  });
});

describe("getCategories", () => {
  it("returns published categories in sort order and skips unpublished ones", async () => {
    const categories = await getCategories();
    const mine = categories.map((c) => c.slug).filter((s) => s.startsWith(`t4-${run}-`));
    expect(mine).toEqual([slugs.catA, slugs.catB, slugs.catToggle]);

    expect(categories.find((c) => c.slug === slugs.catA)).toEqual({
      slug: slugs.catA,
      name: "Fixture A",
      intro: "Intro for A",
      imagePath: "t4/cat-a.jpg",
    });
  });

  it("includes the seeded categories, before the fixtures", async () => {
    const all = (await getCategories()).map((c) => c.slug);
    for (const seeded of ["geogrid", "geomembrane", "geotextile", "geocell"]) {
      expect(all).toContain(seeded);
      expect(all.indexOf(seeded)).toBeLessThan(all.indexOf(slugs.catA));
    }
  });
});

describe("getCategoryWithProducts", () => {
  it("returns the category with its published products in sort order", async () => {
    const result = await getCategoryWithProducts(slugs.catA);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Fixture A");
    expect(result?.products.map((p) => p.slug)).toEqual([slugs.main, slugs.second]);
    expect(result?.products[0]).toEqual({
      slug: slugs.main,
      name: "Zebra grid",
      summary: "Main summary",
      categorySlug: slugs.catA,
      coverImage: "t4/main-1.jpg",
    });
    expect(result?.products[1].coverImage).toBeNull();
  });

  it("returns an empty product list for a published category with no published products", async () => {
    const result = await getCategoryWithProducts(slugs.catB);
    expect(result?.products).toEqual([]);
  });

  it("returns null for an unpublished or unknown category", async () => {
    expect(await getCategoryWithProducts(slugs.catDraft)).toBeNull();
    expect(await getCategoryWithProducts(slug("nope"))).toBeNull();
  });
});

describe("getProduct", () => {
  it("returns the product with its spec grid, in the right category", async () => {
    const product = await getProduct(slugs.catA, slugs.main);
    expect(product).not.toBeNull();
    expect(product).toMatchObject({
      slug: slugs.main,
      name: "Zebra grid",
      summary: "Main summary",
      categorySlug: slugs.catA,
      coverImage: "t4/main-1.jpg",
      overview: "## Overview\n\nBody text",
      features: ["Strong", "Light"],
      images: ["t4/main-1.jpg", "t4/main-2.jpg"],
      datasheetPath: "t4/main.pdf",
    });
    expect(product?.specGrid).toEqual({
      models: ["T4-100", "T4-200", "T4-300"],
      rows: [
        { name: "Tensile strength", unit: "kN/m", testMethod: "ASTM D6637", values: ["15", "20", "30"] },
        // T4-200 has no value row and T4-300 a blank one: both become null, at the right index.
        { name: "Mass", unit: "g/m²", testMethod: null, values: ["150", null, null] },
        { name: "Colour", unit: null, testMethod: null, values: [null, "Black", null] },
      ],
    });
  });

  it("lists only published applications", async () => {
    const product = await getProduct(slugs.catA, slugs.main);
    expect(product?.applications).toEqual([{ slug: slugs.appPub, name: "Fixture application" }]);
  });

  it("gives a product without a spec table an empty grid", async () => {
    const product = await getProduct(slugs.catA, slugs.second);
    expect(product?.specGrid).toEqual({ models: [], rows: [] });
    expect(product?.images).toEqual([]);
    expect(product?.coverImage).toBeNull();
    expect(product?.datasheetPath).toBeNull();
  });

  it("returns null when the category slug is wrong", async () => {
    expect(await getProduct(slugs.catB, slugs.main)).toBeNull();
    expect(await getProduct("geomembrane", slugs.main)).toBeNull();
  });

  it("returns null for an unpublished or unknown product", async () => {
    expect(await getProduct(slugs.catA, slugs.draft)).toBeNull();
    expect(await getProduct(slugs.catA, slug("nope"))).toBeNull();
  });

  it("returns null for a published product whose category is unpublished", async () => {
    // The database policy alone would let a visitor read this product...
    const { data } = await anon.from("products").select("slug").eq("slug", slugs.inDraftCat);
    expect(data).toHaveLength(1);

    // ...so the query has to hide it.
    expect(await getProduct(slugs.catDraft, slugs.inDraftCat)).toBeNull();
  });
});

describe("getApplications and getApplication", () => {
  it("lists published applications in sort order, including the seeded ones", async () => {
    const applications = await getApplications();
    const all = applications.map((a) => a.slug);
    expect(all).toContain(slugs.appPub);
    expect(all).not.toContain(slugs.appDraft);
    expect(all).toContain("roads-and-pavements");
    expect(all.indexOf("roads-and-pavements")).toBeLessThan(all.indexOf(slugs.appPub));

    expect(applications.find((a) => a.slug === slugs.appPub)).toEqual({
      slug: slugs.appPub,
      name: "Fixture application",
      summary: "App summary",
      body: "App body",
      imagePath: "t4/app.jpg",
    });
  });

  it("returns the application with only products that are published in a published category", async () => {
    const application = await getApplication(slugs.appPub);
    expect(application?.name).toBe("Fixture application");
    // Linked: main, second, draft (unpublished), inDraftCat (unpublished category) and
    // toggle (its category is still published at this point).
    expect(application?.products.map((p) => p.slug).sort()).toEqual(
      [slugs.main, slugs.second, slugs.toggle].sort(),
    );
    expect(application?.products.find((p) => p.slug === slugs.main)).toMatchObject({
      name: "Zebra grid",
      categorySlug: slugs.catA,
      coverImage: "t4/main-1.jpg",
    });
  });

  it("returns null for an unpublished or unknown application", async () => {
    expect(await getApplication(slugs.appDraft)).toBeNull();
    expect(await getApplication(slug("nope"))).toBeNull();
  });
});

describe("getProductOptions", () => {
  it("lists published products in published categories only", async () => {
    const options = await getProductOptions();
    const mine = options.filter((o) => o.slug.startsWith(`t4-${run}-`));
    expect(mine).toEqual([
      { slug: slugs.main, name: "Zebra grid" },
      { slug: slugs.second, name: "Alpha grid" },
      { slug: slugs.toggle, name: "Toggled product" },
    ]);
  });
});

describe("getSitemapEntries", () => {
  it("lists published content, with ISO dates, and skips drafts", async () => {
    const entries = await getSitemapEntries();
    const paths = entries.map((e) => e.path);

    for (const expected of [
      "/",
      "/products",
      "/applications",
      "/about",
      "/contact",
      "/quote",
      "/products/geogrid",
      `/products/${slugs.catA}`,
      `/products/${slugs.catA}/${slugs.main}`,
      `/products/${slugs.catA}/${slugs.second}`,
      `/applications/${slugs.appPub}`,
      "/applications/roads-and-pavements",
    ]) {
      expect(paths, expected).toContain(expected);
    }

    expect(paths).not.toContain(`/products/${slugs.catA}/${slugs.draft}`);
    expect(paths).not.toContain(`/products/${slugs.catDraft}`);
    expect(paths).not.toContain(`/products/${slugs.catDraft}/${slugs.inDraftCat}`);
    expect(paths).not.toContain(`/applications/${slugs.appDraft}`);
    // Seeded products are unpublished.
    expect(paths).not.toContain("/products/geogrid/pp-biaxial-geogrid");
    expect(new Set(paths).size).toBe(paths.length);

    for (const entry of entries) {
      expect(Number.isNaN(Date.parse(entry.updatedAt)), entry.path).toBe(false);
      expect(new Date(entry.updatedAt).toISOString(), entry.path).toBe(entry.updatedAt);
    }
  });
});

describe("certifications and projects", () => {
  beforeAll(async () => {
    await insertMany("certifications", [
      {
        name: "Fixture certificate B",
        issuer: "Fixture body",
        valid_until: "2030-01-31",
        file_path: "t4/cert.pdf",
        image_path: "t4/cert.jpg",
        sort_order: 9002,
        published: true,
      },
      { name: "Fixture certificate A", sort_order: 9001, published: true },
      { name: "Fixture certificate draft", sort_order: 9003, published: false },
    ]);

    ids.projPub = await insert("projects", {
      slug: slugs.projPub,
      title: "Fixture project",
      location: "Dubai",
      country: "AE",
      summary: "Project summary",
      body: "Project body",
      images: ["t4/proj-1.jpg", "t4/proj-2.jpg"],
      sort_order: 9001,
      published: true,
    });
    ids.projDraft = await insert("projects", {
      slug: slugs.projDraft,
      title: "Draft project",
      location: "Pune",
      country: "IN",
      sort_order: 9002,
      published: false,
    });
    // main is listed; draft is unpublished and inDraftCat sits in an unpublished category.
    for (const product of [ids.main, ids.draft, ids.inDraftCat]) {
      await link("project_products", { project_id: ids.projPub, product_id: product });
    }
  });

  it("lists published certifications in sort order", async () => {
    const certifications = (await getCertifications()).filter((c) =>
      c.name.startsWith("Fixture certificate"),
    );
    expect(certifications.map((c) => c.name)).toEqual([
      "Fixture certificate A",
      "Fixture certificate B",
    ]);
    expect(certifications[0]).toMatchObject({
      issuer: "",
      validUntil: null,
      filePath: null,
      imagePath: null,
    });
    expect(certifications[1]).toMatchObject({
      issuer: "Fixture body",
      validUntil: "2030-01-31",
      filePath: "t4/cert.pdf",
      imagePath: "t4/cert.jpg",
    });
    expect(typeof certifications[0].id).toBe("string");
  });

  it("lists published projects with only listed products", async () => {
    const projects = (await getProjects()).filter((p) => p.slug.startsWith(`t4-${run}-`));
    expect(projects.map((p) => p.slug)).toEqual([slugs.projPub]);
    expect(projects[0]).toMatchObject({
      title: "Fixture project",
      location: "Dubai",
      country: "AE",
      summary: "Project summary",
      body: "Project body",
      images: ["t4/proj-1.jpg", "t4/proj-2.jpg"],
      coverImage: "t4/proj-1.jpg",
    });
    // draft (unpublished) and inDraftCat (unpublished category) are left out.
    expect(projects[0].products.map((p) => p.slug)).toEqual([slugs.main]);
  });

  it("returns a project by slug, and null when unpublished or unknown", async () => {
    const project = await getProject(slugs.projPub);
    expect(project?.title).toBe("Fixture project");
    expect(project?.products).toEqual([
      {
        slug: slugs.main,
        name: "Zebra grid",
        summary: "Main summary",
        categorySlug: slugs.catA,
        coverImage: "t4/main-1.jpg",
      },
    ]);
    expect(await getProject(slugs.projDraft)).toBeNull();
    expect(await getProject(slug("nope"))).toBeNull();
  });

  it("shows certifications and projects in the nav once something is published", async () => {
    expect(await getNavVisibility()).toEqual({ certifications: true, projects: true });
  });

  it("puts them in the sitemap too", async () => {
    const paths = (await getSitemapEntries()).map((e) => e.path);
    expect(paths).toContain("/certifications");
    expect(paths).toContain("/projects");
    expect(paths).toContain(`/projects/${slugs.projPub}`);
    expect(paths).not.toContain(`/projects/${slugs.projDraft}`);
  });
});

describe("getSiteSettings", () => {
  it("returns the settings row in camelCase", async () => {
    const settings = await getSiteSettings();
    expect(settings.tagline).toBe("Geosynthetic solutions for India and the UAE");
    expect(settings.heroTitle.length).toBeGreaterThan(0);
    expect(settings.heroText.length).toBeGreaterThan(0);
    expect(settings.aboutMd.length).toBeGreaterThan(0);
    expect(Object.keys(settings).sort()).toEqual(
      [
        "tagline",
        "heroTitle",
        "heroText",
        "aboutMd",
        "indiaAddress",
        "indiaPhone",
        "indiaWhatsapp",
        "indiaEmail",
        "uaeAddress",
        "uaePhone",
        "uaeWhatsapp",
        "uaeEmail",
      ].sort(),
    );
  });
});

// Keep this last: it unpublishes a fixture category.
describe("when a category is unpublished", () => {
  it("hides its published products everywhere", async () => {
    // While the category is published, everything shows.
    expect((await getProduct(slugs.catToggle, slugs.toggle))?.name).toBe("Toggled product");
    expect((await getSitemapEntries()).map((e) => e.path)).toContain(
      `/products/${slugs.catToggle}/${slugs.toggle}`,
    );

    const { error } = await service
      .from("categories")
      .update({ published: false })
      .eq("id", ids.catToggle);
    expect(error).toBeNull();

    // The product itself is still published, and a visitor can still read it...
    const { data } = await anon.from("products").select("slug").eq("slug", slugs.toggle);
    expect(data).toHaveLength(1);

    // ...but the site must not show it.
    expect(await getProduct(slugs.catToggle, slugs.toggle)).toBeNull();
    expect(await getCategoryWithProducts(slugs.catToggle)).toBeNull();
    expect((await getCategories()).map((c) => c.slug)).not.toContain(slugs.catToggle);
    expect((await getProductOptions()).map((o) => o.slug)).not.toContain(slugs.toggle);
    expect((await getApplication(slugs.appPub))?.products.map((p) => p.slug)).not.toContain(
      slugs.toggle,
    );

    const paths = (await getSitemapEntries()).map((e) => e.path);
    expect(paths.filter((p) => p.startsWith(`/products/${slugs.catToggle}`))).toEqual([]);
  });
});

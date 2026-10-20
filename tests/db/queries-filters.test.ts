import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
  getSitemapEntries,
} from "@/lib/content/queries";
import { serviceClient } from "./helpers";

// queries.test.ts runs the queries as a real visitor, where row level security
// already hides most unpublished rows. Here the same queries run with a
// service-role client, which sees every row, so these tests prove the queries
// apply the "published, and category published" rules themselves rather than
// leaning on the database policies.

vi.mock("@/lib/supabase/public", async () => {
  const { serviceClient: bypassRls } = await import("./helpers");
  return { getPublicClient: () => bypassRls() };
});

const run = randomUUID().slice(0, 8);
const slug = (label: string) => `t4f-${run}-${label}`;
const service = serviceClient();
const created: Array<{ table: string; id: string }> = [];

async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await service.from(table).insert(row).select("id").single();
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  created.push({ table, id: data.id });
  return data.id;
}

async function link(table: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await service.from(table).insert(row);
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
}

const s = {
  cat: slug("cat"),
  catDraft: slug("cat-draft"),
  shown: slug("shown"),
  draft: slug("draft"),
  inDraftCat: slug("in-draft-cat"),
  app: slug("app"),
  appDraft: slug("app-draft"),
  proj: slug("proj"),
  projDraft: slug("proj-draft"),
};

beforeAll(async () => {
  const cat = await insert("categories", { slug: s.cat, name: "Shown cat", sort_order: 9101, published: true });
  const catDraft = await insert("categories", {
    slug: s.catDraft,
    name: "Draft cat",
    sort_order: 9102,
    published: false,
  });
  const shown = await insert("products", { slug: s.shown, category_id: cat, name: "Shown", published: true });
  const draft = await insert("products", { slug: s.draft, category_id: cat, name: "Draft", published: false });
  const inDraftCat = await insert("products", {
    slug: s.inDraftCat,
    category_id: catDraft,
    name: "In draft category",
    published: true,
  });
  const app = await insert("applications", { slug: s.app, name: "App", sort_order: 9101, published: true });
  const appDraft = await insert("applications", {
    slug: s.appDraft,
    name: "App draft",
    sort_order: 9102,
    published: false,
  });
  for (const product of [shown, draft, inDraftCat]) {
    await link("product_applications", { product_id: product, application_id: app });
  }
  await link("product_applications", { product_id: shown, application_id: appDraft });

  const proj = await insert("projects", {
    slug: s.proj,
    title: "Project",
    country: "IN",
    sort_order: 9101,
    published: true,
  });
  await insert("projects", { slug: s.projDraft, title: "Project draft", country: "IN", published: false });
  for (const product of [shown, draft, inDraftCat]) {
    await link("project_products", { project_id: proj, product_id: product });
  }
  await insert("certifications", { name: `t4f-${run} cert`, sort_order: 9101, published: true });
  await insert("certifications", { name: `t4f-${run} cert draft`, published: false });
});

afterAll(async () => {
  for (const { table, id } of [...created].reverse()) {
    await service.from(table).delete().eq("id", id);
  }
});

const mine = <T extends { slug: string }>(rows: T[]) => rows.filter((r) => r.slug.startsWith(`t4f-${run}-`));

describe("published checks made by the queries themselves (RLS bypassed)", () => {
  it("sees the hidden rows through a plain service-role read", async () => {
    // Guards the setup: if this fails, the tests below prove nothing.
    const { data } = await service
      .from("products")
      .select("slug")
      .in("slug", [s.draft, s.inDraftCat]);
    expect(data).toHaveLength(2);
  });

  it("getCategories skips unpublished categories", async () => {
    expect(mine(await getCategories()).map((c) => c.slug)).toEqual([s.cat]);
  });

  it("getCategoryWithProducts lists published products only, and nothing for an unpublished category", async () => {
    expect((await getCategoryWithProducts(s.cat))?.products.map((p) => p.slug)).toEqual([s.shown]);
    expect(await getCategoryWithProducts(s.catDraft)).toBeNull();
  });

  it("getProduct hides drafts, products in unpublished categories and wrong category slugs", async () => {
    expect((await getProduct(s.cat, s.shown))?.slug).toBe(s.shown);
    expect(await getProduct(s.cat, s.draft)).toBeNull();
    expect(await getProduct(s.catDraft, s.inDraftCat)).toBeNull();
    expect(await getProduct(s.catDraft, s.shown)).toBeNull();
    expect(await getProduct(s.cat, s.inDraftCat)).toBeNull();
  });

  it("getProduct lists published applications only", async () => {
    expect((await getProduct(s.cat, s.shown))?.applications.map((a) => a.slug)).toEqual([s.app]);
  });

  it("getApplications and getApplication skip drafts and hidden products", async () => {
    expect(mine(await getApplications()).map((a) => a.slug)).toEqual([s.app]);
    expect(await getApplication(s.appDraft)).toBeNull();
    expect((await getApplication(s.app))?.products.map((p) => p.slug)).toEqual([s.shown]);
  });

  it("getProductOptions skips drafts and products in unpublished categories", async () => {
    expect(mine(await getProductOptions()).map((o) => o.slug)).toEqual([s.shown]);
  });

  it("getProjects and getProject skip drafts and hidden products", async () => {
    expect(mine(await getProjects()).map((p) => p.slug)).toEqual([s.proj]);
    expect((await getProject(s.proj))?.products.map((p) => p.slug)).toEqual([s.shown]);
    expect(await getProject(s.projDraft)).toBeNull();
  });

  it("getCertifications skips drafts", async () => {
    const names = (await getCertifications()).map((c) => c.name);
    expect(names).toContain(`t4f-${run} cert`);
    expect(names).not.toContain(`t4f-${run} cert draft`);
  });

  it("getNavVisibility counts published rows only", async () => {
    expect(await getNavVisibility()).toEqual({ certifications: true, projects: true });

    // Only the draft rows left: nothing to show.
    await service.from("certifications").update({ published: false }).like("name", `t4f-${run} cert%`);
    await service.from("projects").update({ published: false }).like("slug", `t4f-${run}-proj%`);
    expect(await getNavVisibility()).toEqual({ certifications: false, projects: false });
  });

  it("getSitemapEntries leaves out drafts and products in unpublished categories", async () => {
    const paths = (await getSitemapEntries()).map((e) => e.path);
    expect(paths).toContain(`/products/${s.cat}`);
    expect(paths).toContain(`/products/${s.cat}/${s.shown}`);
    expect(paths).toContain(`/applications/${s.app}`);
    expect(paths).not.toContain(`/products/${s.cat}/${s.draft}`);
    expect(paths).not.toContain(`/products/${s.catDraft}`);
    expect(paths).not.toContain(`/products/${s.catDraft}/${s.inDraftCat}`);
    expect(paths).not.toContain(`/applications/${s.appDraft}`);
    expect(paths.filter((p) => p.startsWith(`/projects/${s.projDraft}`))).toEqual([]);
  });
});

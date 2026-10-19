import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, createUser, serviceClient, signedInClient } from "./helpers";

const run = randomUUID().slice(0, 8);
const password = "Test-password-123";
const adminEmail = `admin-${run}@example.test`;
const memberEmail = `member-${run}@example.test`;

const service = serviceClient();
const anon = anonClient();
let admin: SupabaseClient;
let member: SupabaseClient; // signed in, but not an admin
let adminId: string;
let memberId: string;
let db: pg.Client;

// Rows created by these tests, deleted in reverse order afterwards.
const created: Array<{ table: string; id: string }> = [];
let previousRecipient: { country: string; email: string } | null = null;
let previousSettings: Record<string, unknown> | null = null;
const uploaded: Array<{ bucket: string; path: string }> = [];

async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await service.from(table).insert(row).select("id").single();
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  created.push({ table, id: data.id });
  return data.id;
}

const slug = (label: string) => `t-${run}-${label}`;

let publishedCategory: string;
let publishedProduct: string;
let unpublishedProduct: string;

beforeAll(async () => {
  adminId = await createUser(adminEmail, password, { admin: true });
  memberId = await createUser(memberEmail, password, { admin: false });
  admin = await signedInClient(adminEmail, password);
  member = await signedInClient(memberEmail, password);

  db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();

  publishedCategory = await insert("categories", {
    slug: slug("cat-pub"),
    name: "Published category",
    published: true,
  });
  publishedProduct = await insert("products", {
    slug: slug("prod-pub"),
    category_id: publishedCategory,
    name: "Published product",
    published: true,
  });
  unpublishedProduct = await insert("products", {
    slug: slug("prod-draft"),
    category_id: publishedCategory,
    name: "Draft product",
    published: false,
  });
});

afterAll(async () => {
  for (const { bucket, path } of uploaded) {
    await service.storage.from(bucket).remove([path]);
  }
  for (const { table, id } of [...created].reverse()) {
    await service.from(table).delete().eq("id", id);
  }
  if (previousRecipient) {
    await service.from("quote_recipients").upsert(previousRecipient);
  } else {
    await service.from("quote_recipients").delete().eq("email", `recipient-${run}@example.test`);
  }
  if (previousSettings) await service.from("site_settings").update(previousSettings).eq("id", 1);
  for (const id of [adminId, memberId]) {
    if (id) await service.auth.admin.deleteUser(id);
  }
  await db?.end();
});

describe("anonymous read access", () => {
  it("select on products returns only published rows", async () => {
    const { data, error } = await anon.from("products").select("id, published").limit(1000);
    expect(error).toBeNull();
    const rows = data ?? [];
    expect(rows.every((row) => row.published === true)).toBe(true);
    expect(rows.map((row) => row.id)).toContain(publishedProduct);
    expect(rows.map((row) => row.id)).not.toContain(unpublishedProduct);
  });

  const publishable: Array<[string, (published: boolean) => Record<string, unknown>]> = [
    ["categories", (published) => ({ slug: slug(`cat-${published}`), name: "n", published })],
    ["applications", (published) => ({ slug: slug(`app-${published}`), name: "n", published })],
    ["certifications", (published) => ({ name: "n", issuer: "i", published })],
    [
      "projects",
      (published) => ({ slug: slug(`proj-${published}`), title: "t", location: "l", country: "AE", published }),
    ],
  ];

  it.each(publishable)("select on %s returns only published rows", async (table, makeRow) => {
    const publishedId = await insert(table, makeRow(true));
    const draftId = await insert(table, makeRow(false));
    const { data, error } = await anon.from(table).select("id, published").in("id", [publishedId, draftId]);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: publishedId, published: true }]);
  });

  it("spec rows are visible only for published products", async () => {
    const grid = {
      models: ["M1"],
      rows: [{ name: "Tensile", unit: "kN/m", test_method: "ASTM D6637", values: ["10"] }],
    };
    for (const productId of [publishedProduct, unpublishedProduct]) {
      const saved = await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: grid });
      expect(saved.error).toBeNull();
    }
    for (const table of ["spec_models", "spec_properties"]) {
      const { data } = await anon
        .from(table)
        .select("product_id")
        .in("product_id", [publishedProduct, unpublishedProduct]);
      expect(data).toEqual([{ product_id: publishedProduct }]);
    }
    const { data: values } = await anon.from("spec_values").select("id, property_id");
    const { data: props } = await service
      .from("spec_properties")
      .select("id, product_id")
      .in("product_id", [publishedProduct, unpublishedProduct]);
    const publishedProp = props?.find((p) => p.product_id === publishedProduct)?.id;
    const draftProp = props?.find((p) => p.product_id === unpublishedProduct)?.id;
    expect(values?.map((v) => v.property_id)).toContain(publishedProp);
    expect(values?.map((v) => v.property_id)).not.toContain(draftProp);
  });

  it("link tables expose only links between published rows", async () => {
    const publishedApp = await insert("applications", { slug: slug("app-pub"), name: "A", published: true });
    const draftApp = await insert("applications", { slug: slug("app-draft"), name: "B", published: false });
    await service.from("product_applications").insert([
      { product_id: publishedProduct, application_id: publishedApp },
      { product_id: publishedProduct, application_id: draftApp },
      { product_id: unpublishedProduct, application_id: publishedApp },
    ]);
    const { data, error } = await anon
      .from("product_applications")
      .select("product_id, application_id")
      .in("product_id", [publishedProduct, unpublishedProduct]);
    expect(error).toBeNull();
    expect(data).toEqual([{ product_id: publishedProduct, application_id: publishedApp }]);

    const publishedProject = await insert("projects", {
      slug: slug("proj-pub"), title: "P", location: "L", country: "IN", published: true,
    });
    const draftProject = await insert("projects", {
      slug: slug("proj-draft"), title: "Q", location: "L", country: "IN", published: false,
    });
    await service.from("project_products").insert([
      { project_id: publishedProject, product_id: publishedProduct },
      { project_id: draftProject, product_id: publishedProduct },
      { project_id: publishedProject, product_id: unpublishedProduct },
    ]);
    const links = await anon
      .from("project_products")
      .select("project_id, product_id")
      .in("product_id", [publishedProduct, unpublishedProduct]);
    expect(links.error).toBeNull();
    expect(links.data).toEqual([{ project_id: publishedProject, product_id: publishedProduct }]);
  });

  it("site_settings is a single row that anyone can read", async () => {
    const { data, error } = await anon.from("site_settings").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 1 }]);
    const second = await service.from("site_settings").insert({ id: 2 });
    expect(second.error).not.toBeNull();
  });
});

describe("private tables", () => {
  let requestId: string;

  beforeAll(async () => {
    requestId = await insert("quote_requests", {
      name: "Buyer",
      email: "buyer@example.test",
      phone: "+91 90000 00000",
      country: "IN",
      message: "Please quote",
    });
    const existing = await service.from("quote_recipients").select("country, email").eq("country", "IN").maybeSingle();
    previousRecipient = existing.data;
    const { error } = await service
      .from("quote_recipients")
      .upsert({ country: "IN", email: `recipient-${run}@example.test` });
    if (error) throw new Error(error.message);
  });

  it("anon select on quote_requests returns 0 rows", async () => {
    const { data } = await anon.from("quote_requests").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("anon insert into quote_requests errors", async () => {
    const { error } = await anon.from("quote_requests").insert({
      name: "Spam",
      email: "spam@example.test",
      phone: "1",
      country: "IN",
      message: "x",
    });
    expect(error).not.toBeNull();
  });

  it("anon select on quote_recipients returns 0 rows", async () => {
    const { data } = await anon.from("quote_recipients").select("email");
    expect(data ?? []).toHaveLength(0);
  });

  it("a signed-in non-admin sees no quote requests or recipients and cannot write them", async () => {
    for (const table of ["quote_requests", "quote_recipients", "admins"]) {
      const { data } = await member.from(table).select("*");
      expect(data ?? [], table).toHaveLength(0);
    }
    const update = await member.from("quote_requests").update({ status: "closed" }).eq("id", requestId).select();
    expect(update.data ?? []).toHaveLength(0);
    const { data: row } = await service.from("quote_requests").select("status").eq("id", requestId).single();
    expect(row?.status).toBe("new");
    const insertRequest = await member.from("quote_requests").insert({
      name: "x", email: "x@example.test", phone: "1", country: "AE", message: "x",
    });
    expect(insertRequest.error).not.toBeNull();
  });

  it("a signed-in non-admin cannot make themselves an admin", async () => {
    const { error } = await member.from("admins").insert({ user_id: memberId });
    expect(error).not.toBeNull();
    const { data } = await service.from("admins").select("user_id").eq("user_id", memberId);
    expect(data).toEqual([]);
  });

  it("an admin can read and update quote requests and read recipients", async () => {
    const list = await admin.from("quote_requests").select("id").eq("id", requestId);
    expect(list.data).toEqual([{ id: requestId }]);
    const update = await admin
      .from("quote_requests")
      .update({ status: "contacted", admin_notes: "called" })
      .eq("id", requestId)
      .select("status");
    expect(update.data).toEqual([{ status: "contacted" }]);
    const recipients = await admin.from("quote_recipients").select("country, email").eq("country", "IN");
    expect(recipients.data).toEqual([{ country: "IN", email: `recipient-${run}@example.test` }]);
  });

  it("quote_requests defaults and constraints", async () => {
    const freshId = await insert("quote_requests", {
      name: "n", email: "e@example.test", phone: "1", country: "AE", message: "m",
    });
    const { data } = await service
      .from("quote_requests")
      .select("status, email_sent, products")
      .eq("id", freshId)
      .single();
    expect(data).toEqual({ status: "new", email_sent: false, products: [] });

    const base = { name: "n", email: "e@example.test", phone: "1", message: "m" };
    const badStatus = await service.from("quote_requests").insert({ ...base, country: "IN", status: "won" });
    expect(badStatus.error?.code).toBe("23514");
    const badCountry = await service.from("quote_requests").insert({ ...base, country: "US" });
    expect(badCountry.error?.code).toBe("23514");
    const badRecipient = await service.from("quote_recipients").insert({ country: "US", email: "e@example.test" });
    expect(badRecipient.error?.code).toBe("23514");
  });
});

describe("content writes", () => {
  it("a signed-in non-admin insert into categories errors", async () => {
    const { error } = await member.from("categories").insert({ slug: slug("member-cat"), name: "Nope" });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("anon cannot write content", async () => {
    const { error } = await anon.from("categories").insert({ slug: slug("anon-cat"), name: "Nope" });
    expect(error).not.toBeNull();
  });

  it("an admin insert into categories succeeds", async () => {
    const { data, error } = await admin
      .from("categories")
      .insert({ slug: slug("admin-cat"), name: "Admin category" })
      .select("id, published, sort_order")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ published: false, sort_order: 0 });
    created.push({ table: "categories", id: data!.id });
  });

  it("a non-admin cannot update or delete content", async () => {
    const update = await member.from("products").update({ name: "Hacked" }).eq("id", publishedProduct).select();
    expect(update.data ?? []).toHaveLength(0);
    const del = await member.from("products").delete().eq("id", publishedProduct).select();
    expect(del.data ?? []).toHaveLength(0);
    const { data } = await service.from("products").select("name").eq("id", publishedProduct).single();
    expect(data?.name).toBe("Published product");
  });

  it("a non-admin can read published content like anyone else", async () => {
    const { data } = await member.from("products").select("id").in("id", [publishedProduct, unpublishedProduct]);
    expect(data).toEqual([{ id: publishedProduct }]);
  });

  it("an admin sees unpublished rows too", async () => {
    const { data } = await admin.from("products").select("id").in("id", [publishedProduct, unpublishedProduct]);
    expect(data?.map((row) => row.id).sort()).toEqual([publishedProduct, unpublishedProduct].sort());
  });

  it("slugs are unique", async () => {
    const { error } = await service
      .from("categories")
      .insert({ slug: slug("cat-pub"), name: "Duplicate slug" });
    expect(error?.code).toBe("23505");
  });

  it("updated_at is refreshed on update", async () => {
    const before = await service.from("products").select("created_at, updated_at").eq("id", publishedProduct).single();
    expect(before.data?.updated_at).toBe(before.data?.created_at);
    await service.from("products").update({ summary: "changed" }).eq("id", publishedProduct);
    const after = await service.from("products").select("created_at, updated_at").eq("id", publishedProduct).single();
    expect(new Date(after.data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.data!.updated_at).getTime(),
    );
    expect(after.data?.created_at).toBe(before.data?.created_at);
  });

  it("only an admin can change the site settings", async () => {
    const current = await service.from("site_settings").select("*").eq("id", 1).single();
    previousSettings = current.data;
    const byMember = await member.from("site_settings").update({ tagline: "hijacked" }).eq("id", 1).select();
    expect(byMember.data ?? []).toHaveLength(0);
    const byAdmin = await admin.from("site_settings").update({ tagline: `tagline ${run}` }).eq("id", 1).select("tagline");
    expect(byAdmin.data).toEqual([{ tagline: `tagline ${run}` }]);
  });
});

describe("save_spec_table", () => {
  type Grid = {
    models: string[];
    rows: Array<{ name: string; unit: string; test_method: string; values: string[] }>;
  };
  let productId: string;

  beforeAll(async () => {
    productId = await insert("products", {
      slug: slug("prod-spec"),
      category_id: publishedCategory,
      name: "Spec product",
    });
  });

  async function readBack(id: string) {
    const [models, properties] = await Promise.all([
      service.from("spec_models").select("id, code, sort_order").eq("product_id", id).order("sort_order"),
      service
        .from("spec_properties")
        .select("id, name, unit, test_method, sort_order")
        .eq("product_id", id)
        .order("sort_order"),
    ]);
    const propertyIds = (properties.data ?? []).map((p) => p.id);
    const values = propertyIds.length
      ? await service.from("spec_values").select("property_id, model_id, value").in("property_id", propertyIds)
      : { data: [] as Array<{ property_id: string; model_id: string; value: string }> };
    const cell = (property: string, model: string) =>
      values.data?.find((v) => v.property_id === property && v.model_id === model)?.value;
    return {
      models: models.data ?? [],
      properties: properties.data ?? [],
      valueCount: values.data?.length ?? 0,
      matrix: (properties.data ?? []).map((p) => (models.data ?? []).map((m) => cell(p.id, m.id))),
    };
  }

  const firstGrid: Grid = {
    models: ["OLD1", "OLD2", "OLD3"],
    rows: [
      { name: "Old A", unit: "x", test_method: "t", values: ["1", "2", "3"] },
      { name: "Old B", unit: "y", test_method: "u", values: ["4", "5", "6"] },
    ],
  };
  const grid: Grid = {
    models: ["BX1515", "BX1620"],
    rows: [
      { name: "Tensile strength MD", unit: "kN/m", test_method: "ASTM D6637", values: ["15", "20"] },
      { name: "Aperture size", unit: "mm", test_method: "", values: ["65 x 65", "65 x 65"] },
      { name: "Roll size", unit: "m", test_method: "", values: ["50 x 3.95", "50 x 3.95"] },
    ],
  };

  it("raises when called by a non-admin", async () => {
    const { error } = await member.rpc("save_spec_table", { p_product_id: productId, p_grid: grid });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/admin/i);
    expect((await readBack(productId)).models).toHaveLength(0);
  });

  it("cannot be called anonymously at all", async () => {
    const { error } = await anon.rpc("save_spec_table", { p_product_id: productId, p_grid: grid });
    expect(error?.code).toBe("42501");
  });

  it("replaces the product's rows in order when called by an admin", async () => {
    const first = await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: firstGrid });
    expect(first.error).toBeNull();
    expect((await readBack(productId)).valueCount).toBe(6);

    const { error } = await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: grid });
    expect(error).toBeNull();

    const saved = await readBack(productId);
    expect(saved.models.map((m) => m.code)).toEqual(["BX1515", "BX1620"]);
    expect(saved.models.map((m) => m.sort_order)).toEqual([0, 1]);
    expect(saved.properties.map((p) => p.name)).toEqual([
      "Tensile strength MD",
      "Aperture size",
      "Roll size",
    ]);
    expect(saved.properties.map((p) => p.sort_order)).toEqual([0, 1, 2]);
    expect(saved.properties[0]).toMatchObject({ unit: "kN/m", test_method: "ASTM D6637" });
    expect(saved.valueCount).toBe(6);
    expect(saved.matrix).toEqual([
      ["15", "20"],
      ["65 x 65", "65 x 65"],
      ["50 x 3.95", "50 x 3.95"],
    ]);
  });

  it("rejects a row whose values length differs from the models count and keeps the old data", async () => {
    const bad = {
      models: ["A", "B"],
      rows: [
        { name: "Fine", unit: "", test_method: "", values: ["1", "2"] },
        { name: "Short", unit: "", test_method: "", values: ["1"] },
      ],
    };
    const { error } = await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: bad });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Short/);
    const saved = await readBack(productId);
    expect(saved.models.map((m) => m.code)).toEqual(["BX1515", "BX1620"]);
    expect(saved.valueCount).toBe(6);
  });

  it("stores empty cells and clears the table for an empty grid", async () => {
    const withBlank = {
      models: ["A", "B"],
      rows: [{ name: "Gap", unit: "", test_method: "", values: ["7", ""] }],
    };
    expect((await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: withBlank })).error).toBeNull();
    expect((await readBack(productId)).matrix).toEqual([["7", ""]]);

    const cleared = await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: { models: [], rows: [] } });
    expect(cleared.error).toBeNull();
    const saved = await readBack(productId);
    expect(saved.models).toHaveLength(0);
    expect(saved.properties).toHaveLength(0);
    expect(saved.valueCount).toBe(0);
  });

  it("rejects malformed grids and unknown products", async () => {
    for (const bad of [null, {}, { models: "A", rows: [] }, { models: ["A"], rows: [{ unit: "x", values: ["1"] }] }]) {
      const { error } = await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: bad });
      expect(error, JSON.stringify(bad)).not.toBeNull();
    }
    const unknown = await admin.rpc("save_spec_table", { p_product_id: randomUUID(), p_grid: { models: [], rows: [] } });
    expect(unknown.error).not.toBeNull();
  });

  it("is removed with the product", async () => {
    await admin.rpc("save_spec_table", { p_product_id: productId, p_grid: grid });
    await service.from("products").delete().eq("id", productId);
    expect((await readBack(productId)).models).toHaveLength(0);
  });
});

describe("database guards", () => {
  const publicTables = `
    select c.relname as tablename, c.relrowsecurity as rowsecurity, c.oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')`;

  it("has row level security enabled on every public table", async () => {
    const { rows } = await db.query<{ tablename: string; rowsecurity: boolean }>(publicTables);
    expect(rows.map((row) => row.tablename).sort()).toEqual(
      [
        "admins", "applications", "categories", "certifications", "product_applications",
        "products", "project_products", "projects", "quote_recipients", "quote_requests",
        "site_settings", "spec_models", "spec_properties", "spec_values",
      ],
    );
    expect(rows.filter((row) => !row.rowsecurity).map((row) => row.tablename)).toEqual([]);
  });

  it("gives anon no write privilege on any public table", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select t.tablename from (${publicTables}) t
       where has_table_privilege('anon', t.oid, 'insert')
          or has_table_privilege('anon', t.oid, 'update')
          or has_table_privilege('anon', t.oid, 'delete')`,
    );
    expect(rows).toEqual([]);
  });

  it("gives anon no access at all to private tables", async () => {
    const { rows } = await db.query<{ tablename: string }>(
      `select t.tablename from (${publicTables}) t
       where t.tablename in ('quote_requests', 'quote_recipients', 'admins')
         and has_table_privilege('anon', t.oid, 'select')`,
    );
    expect(rows).toEqual([]);
  });

  it("keeps internal functions away from API roles", async () => {
    const check = async (role: string, fn: string) =>
      (await db.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, fn]))
        .rows[0].ok;
    expect(await check("anon", "public.save_spec_table(uuid, jsonb)")).toBe(false);
    expect(await check("authenticated", "public.save_spec_table(uuid, jsonb)")).toBe(true);
    expect(await check("anon", "public.set_updated_at()")).toBe(false);
    expect(await check("authenticated", "public.set_updated_at()")).toBe(false);
  });

  it("is_admin() reflects the caller", async () => {
    expect((await admin.rpc("is_admin")).data).toBe(true);
    expect((await member.rpc("is_admin")).data).toBe(false);
    expect((await anon.rpc("is_admin")).data).toBe(false);
  });
});

describe("storage buckets", () => {
  // public-media only takes png/jpeg/webp/pdf (see the 000005 migration), so the test files are PDFs.
  const publicPath = `test/${run}/hello.pdf`;
  const privatePath = `${run}/attachment.txt`;
  const body = new Blob(["hello"], { type: "application/pdf" });
  // quote-attachments only takes the types the quote API stores (see the 000004 migration).
  const attachmentBody = new Blob(["hello"], { type: "application/pdf" });

  beforeAll(async () => {
    for (const [bucket, path, file] of [
      ["public-media", publicPath, body],
      ["quote-attachments", privatePath, attachmentBody],
    ] as const) {
      const { error } = await service.storage.from(bucket).upload(path, file);
      if (error) throw new Error(`upload to ${bucket} failed: ${error.message}`);
      uploaded.push({ bucket, path });
    }
  });

  it("creates public-media as public and quote-attachments as private", async () => {
    const { rows } = await db.query<{ id: string; public: boolean }>(
      "select id, public from storage.buckets where id in ('public-media', 'quote-attachments') order by id",
    );
    expect(rows).toEqual([
      { id: "public-media", public: true },
      { id: "quote-attachments", public: false },
    ]);
  });

  it("serves public-media objects to anyone by URL", async () => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/${publicPath}`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello");
  });

  it("does not serve quote-attachments by public URL", async () => {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/quote-attachments/${privatePath}`;
    expect((await fetch(url)).status).toBeGreaterThanOrEqual(400);
  });

  it("lets only admins write to public-media", async () => {
    const path = `test/${run}/by-admin.pdf`;
    expect((await anon.storage.from("public-media").upload(`test/${run}/by-anon.pdf`, body)).error).not.toBeNull();
    expect((await member.storage.from("public-media").upload(`test/${run}/by-member.pdf`, body)).error).not.toBeNull();
    const ok = await admin.storage.from("public-media").upload(path, body);
    expect(ok.error).toBeNull();
    uploaded.push({ bucket: "public-media", path });
    expect((await member.storage.from("public-media").remove([path])).data ?? []).toHaveLength(0);
    expect((await admin.storage.from("public-media").remove([path])).error).toBeNull();
  });

  it("lets only admins read quote-attachments", async () => {
    expect((await anon.storage.from("quote-attachments").download(privatePath)).error).not.toBeNull();
    expect((await member.storage.from("quote-attachments").download(privatePath)).error).not.toBeNull();
    const signedForMember = await member.storage.from("quote-attachments").createSignedUrl(privatePath, 60);
    expect(signedForMember.error).not.toBeNull();

    const read = await admin.storage.from("quote-attachments").download(privatePath);
    expect(read.error).toBeNull();
    expect(await read.data!.text()).toBe("hello");
    const signed = await admin.storage.from("quote-attachments").createSignedUrl(privatePath, 60);
    expect(signed.error).toBeNull();
    expect((await fetch(signed.data!.signedUrl)).status).toBe(200);
  });

  it("does not let anon or members write to quote-attachments", async () => {
    expect(
      (await anon.storage.from("quote-attachments").upload(`${run}/anon.pdf`, attachmentBody)).error,
    ).not.toBeNull();
    expect(
      (await member.storage.from("quote-attachments").upload(`${run}/member.pdf`, attachmentBody)).error,
    ).not.toBeNull();
  });
});

describe("ensureUser", () => {
  it("is idempotent and toggles admin rights", async () => {
    const email = `toggle-${run}@example.test`;
    const first = await createUser(email, password, { admin: false });
    try {
      expect(await createUser(email, password, { admin: true })).toBe(first);
      expect((await service.from("admins").select("user_id").eq("user_id", first)).data).toEqual([
        { user_id: first },
      ]);
      expect(await createUser(email, "Another-password-456", { admin: true })).toBe(first);
      expect(await signedInClient(email, "Another-password-456")).toBeDefined();
      expect(await createUser(email, "Another-password-456", { admin: false })).toBe(first);
      expect((await service.from("admins").select("user_id").eq("user_id", first)).data).toEqual([]);
    } finally {
      await service.auth.admin.deleteUser(first);
    }
  });
});

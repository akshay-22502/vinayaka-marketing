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

describe("wholesale buyers", () => {
  let buyerId: string;

  beforeAll(async () => {
    buyerId = await insert("wholesale_buyers", { company: `Buyer ${run}`, country: "AE" });
  });

  it("are hidden from visitors and signed-in non-admins, who cannot write them either", async () => {
    for (const client of [anon, member]) {
      for (const table of ["wholesale_buyers", "wholesale_buyer_notes"]) {
        const { data } = await client.from(table).select("*");
        expect(data ?? [], table).toHaveLength(0);
      }
      const insertBuyer = await client.from("wholesale_buyers").insert({ company: "x", country: "IN" });
      expect(insertBuyer.error).not.toBeNull();
      const insertNote = await client.from("wholesale_buyer_notes").insert({ buyer_id: buyerId, body: "x" });
      expect(insertNote.error).not.toBeNull();
      const update = await client.from("wholesale_buyers").update({ status: "onboarded" }).eq("id", buyerId).select();
      expect(update.data ?? []).toHaveLength(0);
    }
    const { data } = await service.from("wholesale_buyers").select("status").eq("id", buyerId).single();
    expect(data?.status).toBe("not_contacted");
  });

  it("an admin can add, read and delete notes, and a note with a status moves the buyer to it", async () => {
    const plain = await admin.from("wholesale_buyer_notes").insert({ buyer_id: buyerId, body: "Called" }).select("id, status").single();
    expect(plain.error).toBeNull();
    expect(plain.data?.status).toBeNull();
    let buyer = await admin.from("wholesale_buyers").select("status").eq("id", buyerId).single();
    expect(buyer.data?.status).toBe("not_contacted");

    const moved = await admin.from("wholesale_buyer_notes").insert({ buyer_id: buyerId, status: "in_discussion" }).select("id").single();
    expect(moved.error).toBeNull();
    buyer = await admin.from("wholesale_buyers").select("status").eq("id", buyerId).single();
    expect(buyer.data?.status).toBe("in_discussion");

    const notes = await admin.from("wholesale_buyer_notes").select("id").eq("buyer_id", buyerId);
    expect(notes.data).toHaveLength(2);
    const removed = await admin.from("wholesale_buyer_notes").delete().eq("id", plain.data!.id).select("id");
    expect(removed.data).toHaveLength(1);
  });

  it("refuses unknown statuses, countries and empty notes", async () => {
    expect((await service.from("wholesale_buyers").insert({ company: "x", country: "US" })).error?.code).toBe("23514");
    expect((await service.from("wholesale_buyers").insert({ company: "x", country: "IN", status: "won" })).error?.code).toBe("23514");
    expect((await service.from("wholesale_buyers").insert({ company: "x", country: "IN", priority: "urgent" })).error?.code).toBe("23514");
    expect((await service.from("wholesale_buyer_notes").insert({ buyer_id: buyerId, body: "" })).error?.code).toBe("23514");
  });

  it("deleting a buyer deletes its notes", async () => {
    const id = await insert("wholesale_buyers", { company: `Gone ${run}`, country: "IN" });
    await service.from("wholesale_buyer_notes").insert({ buyer_id: id, body: "x" });
    const removed = await admin.from("wholesale_buyers").delete().eq("id", id).select("id");
    expect(removed.data).toHaveLength(1);
    const { data } = await service.from("wholesale_buyer_notes").select("id").eq("buyer_id", id);
    expect(data).toEqual([]);
  });
});

describe("suppliers and purchases", () => {
  const tables = ["suppliers", "purchases", "purchase_items", "purchase_costs"];
  let supplierId: string;
  let purchaseId: string;

  beforeAll(async () => {
    supplierId = await insert("suppliers", { name: `Supplier ${run}` });
    purchaseId = await insert("purchases", { supplier_id: supplierId, destination: "IN", exchange_rate: 83.5 });
    await service.from("purchase_items").insert({ purchase_id: purchaseId, product_id: publishedProduct, rolls: 10, sqm_per_roll: 350, unit_price: 0.5 });
    await service.from("purchase_costs").insert({ purchase_id: purchaseId, kind: "freight", amount: 1000 });
  });

  it("are hidden from visitors and signed-in non-admins, who cannot write them either", async () => {
    for (const client of [anon, member]) {
      for (const table of tables) {
        const { data } = await client.from(table).select("*");
        expect(data ?? [], table).toHaveLength(0);
      }
      expect((await client.from("suppliers").insert({ name: "x" })).error).not.toBeNull();
      expect((await client.from("purchases").insert({ supplier_id: supplierId, destination: "IN", exchange_rate: 1 })).error).not.toBeNull();
      expect((await client.from("purchase_items").insert({ purchase_id: purchaseId, rolls: 1, sqm_per_roll: 1, unit_price: 1 })).error).not.toBeNull();
      expect((await client.from("purchase_costs").insert({ purchase_id: purchaseId, kind: "other", amount: 1 })).error).not.toBeNull();
      const update = await client.from("purchases").update({ exchange_rate: 1 }).eq("id", purchaseId).select();
      expect(update.data ?? []).toHaveLength(0);
    }
    const { data } = await service.from("purchases").select("exchange_rate").eq("id", purchaseId).single();
    expect(Number(data?.exchange_rate)).toBe(83.5);
  });

  it("an admin can read and write them all", async () => {
    for (const table of tables) {
      const { data, error } = await admin.from(table).select("id");
      expect(error, table).toBeNull();
      expect((data ?? []).length, table).toBeGreaterThan(0);
    }
    const cost = await admin.from("purchase_costs").insert({ purchase_id: purchaseId, kind: "customs_duty", amount: 25000 }).select("id").single();
    expect(cost.error).toBeNull();
    const removed = await admin.from("purchase_costs").delete().eq("id", cost.data!.id).select("id");
    expect(removed.data).toHaveLength(1);
  });

  it("refuses unknown values and impossible numbers", async () => {
    const bad = async (table: string, row: Record<string, unknown>) => (await service.from(table).insert(row)).error?.code;
    expect(await bad("suppliers", { name: "" })).toBe("23514");
    expect(await bad("purchases", { supplier_id: supplierId, destination: "US", exchange_rate: 1 })).toBe("23514");
    expect(await bad("purchases", { supplier_id: supplierId, destination: "IN", exchange_rate: 0 })).toBe("23514");
    expect(await bad("purchases", { supplier_id: supplierId, destination: "IN", exchange_rate: 1, currency: "EUR" })).toBe("23514");
    expect(await bad("purchases", { supplier_id: supplierId, destination: "IN", exchange_rate: 1, status: "lost" })).toBe("23514");
    expect(await bad("purchase_items", { purchase_id: purchaseId, rolls: 0, sqm_per_roll: 1, unit_price: 1 })).toBe("23514");
    expect(await bad("purchase_items", { purchase_id: purchaseId, rolls: 1, sqm_per_roll: 1, unit_price: -1 })).toBe("23514");
    expect(await bad("purchase_items", { purchase_id: purchaseId, rolls: 1, sqm_per_roll: 1, unit_price: 1, price_basis: "kg" })).toBe("23514");
    expect(await bad("purchase_costs", { purchase_id: purchaseId, kind: "tips", amount: 1 })).toBe("23514");
    expect(await bad("purchase_costs", { purchase_id: purchaseId, kind: "other", amount: -1 })).toBe("23514");
  });

  it("keeps a supplier that has purchases, and deletes a purchase with its lines", async () => {
    const blocked = await admin.from("suppliers").delete().eq("id", supplierId);
    expect(blocked.error?.code).toBe("23503");

    const id = await insert("purchases", { supplier_id: supplierId, destination: "AE", exchange_rate: 3.67 });
    await service.from("purchase_items").insert({ purchase_id: id, description: "x", rolls: 1, sqm_per_roll: 1, unit_price: 1 });
    await service.from("purchase_costs").insert({ purchase_id: id, kind: "other", amount: 1 });
    const removed = await admin.from("purchases").delete().eq("id", id).select("id");
    expect(removed.data).toHaveLength(1);
    expect((await service.from("purchase_items").select("id").eq("purchase_id", id)).data).toEqual([]);
    expect((await service.from("purchase_costs").select("id").eq("purchase_id", id)).data).toEqual([]);
  });

  it("keeps a product line when its catalogue product is deleted", async () => {
    const category = await insert("categories", { slug: slug("cat-buy"), name: "Bought category" });
    const product = await insert("products", { slug: slug("prod-buy"), category_id: category, name: "Bought product" });
    const line = await service.from("purchase_items").insert({ purchase_id: purchaseId, product_id: product, rolls: 1, sqm_per_roll: 1, unit_price: 1 }).select("id").single();
    await service.from("products").delete().eq("id", product);
    const { data } = await service.from("purchase_items").select("product_id").eq("id", line.data!.id).single();
    expect(data).toEqual({ product_id: null });
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
        "admins", "applications", "categories", "certifications", "document_categories", "product_applications",
        "products", "project_products", "projects", "purchase_costs", "purchase_documents", "purchase_items", "purchases",
        "quote_recipients", "quote_requests", "site_settings", "spec_models", "spec_properties", "spec_values",
        "suppliers", "wholesale_buyer_notes", "wholesale_buyers",
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
       where t.tablename in ('quote_requests', 'quote_recipients', 'admins', 'wholesale_buyers', 'wholesale_buyer_notes',
                             'suppliers', 'purchases', 'purchase_items', 'purchase_costs')
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
    expect(await check("anon", "public.apply_buyer_note_status()")).toBe(false);
    expect(await check("authenticated", "public.apply_buyer_note_status()")).toBe(false);
  });

  it("keeps a newly created function in public away from anon and signed-in users until it is granted", async () => {
    // Migration 000006 changes the default privileges. Without it Postgres (and Supabase's own
    // defaults) would let anon call any function a later migration adds, through /rest/v1/rpc.
    const fn = `public.default_acl_check_${run}()`;
    await db.query(`create function ${fn} returns integer language sql as 'select 1'`);
    try {
      for (const role of ["anon", "authenticated"]) {
        const { rows } = await db.query<{ ok: boolean }>(
          "select has_function_privilege($1, $2, 'execute') as ok",
          [role, fn],
        );
        expect(rows[0].ok, `${role} can execute a new function`).toBe(false);
      }
    } finally {
      await db.query(`drop function ${fn}`);
    }
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

describe("purchase documents", () => {
  let purchaseId: string;
  let categoryId: string;
  const path = () => `purchases/${purchaseId}/${run}-invoice.pdf`;

  beforeAll(async () => {
    const supplierId = await insert("suppliers", { name: `Document supplier ${run}` });
    purchaseId = await insert("purchases", { supplier_id: supplierId, destination: "IN", exchange_rate: 84 });
    categoryId = await insert("document_categories", { name: `Category ${run}`, sort_order: 5 });
    await insert("purchase_documents", { purchase_id: purchaseId, category_id: categoryId, title: "Invoice", file_path: path() });
  });

  it("starts with the standard categories", async () => {
    const { data } = await service.from("document_categories").select("name").in("name", ["Commercial invoice", "Packing list", "Bill of lading", "Other"]);
    expect(data).toHaveLength(4);
  });

  it("files a cost saved without a step under its kind's step, and refuses unknown steps", async () => {
    const stepOf = async (kind: string) => {
      const { data, error } = await service.from("purchase_costs").insert({ purchase_id: purchaseId, kind, amount: 1 }).select("stage").single();
      expect(error).toBeNull();
      return data?.stage;
    };
    expect(await stepOf("supplier_charges")).toBe("quotation");
    expect(await stepOf("customs_duty")).toBe("port");
    expect(await stepOf("transport")).toBe("delivery");
    expect(await stepOf("bank_charges")).toBe("payment");
    const bad = await service.from("purchase_costs").insert({ purchase_id: purchaseId, kind: "other", amount: 1, stage: "customs" });
    expect(bad.error?.code).toBe("23514");
    const badDocument = await service.from("purchase_documents").insert({ purchase_id: purchaseId, title: "x", file_path: `purchases/${purchaseId}/s.pdf`, stage: "customs" });
    expect(badDocument.error?.code).toBe("23514");
  });

  it("keeps the step fields and rates in range", async () => {
    const update = (row: Record<string, unknown>) => service.from("purchases").update(row).eq("id", purchaseId);
    expect((await update({ status: "quotation", incoterm: "FOB", bank_rate: 86.4, inr_per_aed: 23.1 })).error).toBeNull();
    expect((await update({ status: "delivered" })).error).toBeNull();
    expect((await update({ incoterm: "XYZ" })).error?.code).toBe("23514");
    expect((await update({ bank_rate: 0 })).error?.code).toBe("23514");
  });

  it("are hidden from visitors and signed-in non-admins, who cannot write them either", async () => {
    for (const client of [anon, member]) {
      for (const table of ["document_categories", "purchase_documents"]) {
        const { data } = await client.from(table).select("*");
        expect(data ?? [], table).toHaveLength(0);
      }
      expect((await client.from("document_categories").insert({ name: `x-${run}` })).error).not.toBeNull();
      const document = { purchase_id: purchaseId, title: "x", file_path: `purchases/${purchaseId}/x-${run}.pdf` };
      expect((await client.from("purchase_documents").insert(document)).error).not.toBeNull();
    }
  });

  it("an admin can read and write them, and category names are unique whatever the capitals", async () => {
    const { data, error } = await admin.from("purchase_documents").select("id, title").eq("purchase_id", purchaseId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const same = await admin.from("document_categories").insert({ name: `CATEGORY ${run}` });
    expect(same.error?.code).toBe("23505");
  });

  it("refuses a file outside the purchases folder", async () => {
    const { error } = await service.from("purchase_documents").insert({ purchase_id: purchaseId, title: "x", file_path: "products/x.pdf" });
    expect(error?.code).toBe("23514");
  });

  it("keeps a category's documents when the category is deleted, and drops them with their purchase", async () => {
    const otherCategory = await insert("document_categories", { name: `Temporary ${run}` });
    const documentId = await insert("purchase_documents", {
      purchase_id: purchaseId,
      category_id: otherCategory,
      title: "Packing list",
      file_path: `purchases/${purchaseId}/${run}-packing.pdf`,
    });
    await admin.from("document_categories").delete().eq("id", otherCategory);
    const { data } = await service.from("purchase_documents").select("category_id").eq("id", documentId).single();
    expect(data?.category_id).toBeNull();

    const supplierId = await insert("suppliers", { name: `Gone supplier ${run}` });
    const gone = await insert("purchases", { supplier_id: supplierId, destination: "IN", exchange_rate: 1 });
    await service.from("purchase_documents").insert({ purchase_id: gone, title: "x", file_path: `purchases/${gone}/x.pdf` });
    await admin.from("purchases").delete().eq("id", gone);
    const left = await service.from("purchase_documents").select("id").eq("purchase_id", gone);
    expect(left.data).toEqual([]);
  });

  it("keeps the files private: only an admin can upload, list or sign them", async () => {
    const file = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const upload = await admin.storage.from("purchase-documents").upload(path(), file, { contentType: "application/pdf" });
    expect(upload.error).toBeNull();
    uploaded.push({ bucket: "purchase-documents", path: path() });

    for (const client of [anon, member]) {
      expect((await client.storage.from("purchase-documents").upload(`purchases/${purchaseId}/x-${run}.pdf`, file, { contentType: "application/pdf" })).error).not.toBeNull();
      expect((await client.storage.from("purchase-documents").createSignedUrl(path(), 60)).error).not.toBeNull();
    }
    const signed = await admin.storage.from("purchase-documents").createSignedUrl(path(), 60);
    expect(signed.error).toBeNull();
    const removed = await admin.storage.from("purchase-documents").remove([path()]);
    expect(removed.error).toBeNull();
  });
});

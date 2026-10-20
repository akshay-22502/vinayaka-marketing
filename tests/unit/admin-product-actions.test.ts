import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type Outcome, type Query, type RpcCall } from "../support/fake-supabase";

// saveProduct, deleteProduct and saveSpecGrid against a fake Supabase client: that each checks for
// an admin before anything else, what is written, and how errors come back. The real thing (RLS,
// the RPC, the browser, the public page changing) runs in tests/e2e/admin-product.spec.ts and
// tests/db/rls.test.ts.

vi.mock("next/navigation", () => ({
  // The real redirect() throws; so does this one, so code after it cannot run.
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/require-admin", () => ({ requireAdmin: () => requireAdmin() }));

const { deleteProduct, saveProduct, saveSpecGrid } = await import("@/app/admin/(protected)/products/actions");

const ID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";
const CATEGORY_ID = "3e4f5a6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7";
const APP_A = "5a6b7c8d-9e0f-4a1b-b2c3-d4e5f6a7b8c9";
const APP_B = "6b7c8d9e-0f1a-4b2c-83d4-e5f6a7b8c9d0";
const APP_C = "7c8d9e0f-1a2b-4c3d-94e5-f6a7b8c9d0e1";

function fakeSupabase(answer?: (query: Query) => Outcome, answerRpc?: (call: RpcCall) => Outcome) {
  const fake = createFakeSupabase({ answer: answer ?? (() => ({ data: [{ id: ID }] })), answerRpc });
  requireAdmin.mockResolvedValue({ userId: "admin-1", supabase: fake.supabase });
  return fake;
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

const opNames = (query: Query) => query.ops.map((op) => op.name);
const fields = { name: "PP Biaxial Geogrid", category_id: CATEGORY_ID };

beforeEach(() => {
  requireAdmin.mockReset();
  revalidatePath.mockReset();
});

describe("every product action checks for an admin first", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["saveProduct", () => saveProduct(null, form(fields))],
    ["deleteProduct", () => deleteProduct(ID)],
    ["saveSpecGrid", () => saveSpecGrid(ID, { models: ["A"], rows: [] })],
  ];

  it.each(cases)("%s sends a visitor to the login page and touches nothing", async (_name, run) => {
    const { queries, rpcCalls } = createFakeSupabase({});
    requireAdmin.mockImplementation(() => {
      throw new Error("REDIRECT /admin/login");
    });
    await expect(run()).rejects.toThrow("REDIRECT /admin/login");
    expect(queries).toEqual([]);
    expect(rpcCalls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveProduct", () => {
  it("returns field errors without touching the database", async () => {
    const { queries } = fakeSupabase();
    const result = await saveProduct(null, form({ name: "", category_id: "", sort_order: "x" }));
    expect(result).toEqual({
      ok: false,
      errors: { name: "Enter a name", category_id: "Choose a category", sort_order: "Enter a whole number" },
    });
    expect(queries).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("creates the product with its links, refreshes the whole site and opens the new product to add its spec table", async () => {
    const { queries } = fakeSupabase((query) =>
      query.table === "products" ? { data: { id: ID } } : { data: [] },
    );
    await expect(
      saveProduct(
        null,
        form({
          ...fields,
          slug: "",
          summary: "Equal strength both ways.",
          overview: "Text",
          features: "Strong\r\nUV stable",
          images: ["products/a-1.png"],
          datasheet_path: "products/b-2.pdf",
          application_ids: [APP_A, APP_B],
          sort_order: "4",
          published: "on",
        }),
      ),
    ).rejects.toThrow(`REDIRECT /admin/products/${ID}?created=1`);

    expect(queries[0].table).toBe("products");
    expect(opNames(queries[0])[0]).toBe("insert");
    const row = queries[0].ops[0].args[0] as Record<string, unknown>;
    expect(row).toEqual({
      name: "PP Biaxial Geogrid",
      slug: "pp-biaxial-geogrid",
      category_id: CATEGORY_ID,
      summary: "Equal strength both ways.",
      overview: "Text",
      features: ["Strong", "UV stable"],
      images: ["products/a-1.png"],
      datasheet_path: "products/b-2.pdf",
      sort_order: 4,
      published: true,
    });
    // Link ids and the publish confirmation are not columns of products.
    expect(row).not.toHaveProperty("application_ids");
    expect(row).not.toHaveProperty("confirm_unverified");

    const inserted = queries.find((query) => query.table === "product_applications" && opNames(query)[0] === "insert");
    expect(inserted?.ops[0].args[0]).toEqual([
      { product_id: ID, application_id: APP_A },
      { product_id: ID, application_id: APP_B },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("updates the product named by the hidden id, then adds new application links before it removes dropped ones (Ruling R12)", async () => {
    const { queries } = fakeSupabase((query) => {
      if (query.table === "product_applications" && query.ops[0].name === "select") {
        return { data: [{ application_id: APP_A }, { application_id: APP_B }] };
      }
      return { data: [{ id: ID }] };
    });

    const result = await saveProduct(null, form({ ...fields, id: ID, application_ids: [APP_B, APP_C] }));
    expect(result).toEqual({ ok: true });

    expect(queries[0].table).toBe("products");
    expect(queries[0].ops[0].name).toBe("update");
    expect(queries[0].ops).toContainEqual({ name: "eq", args: ["id", ID] });

    const links = queries.filter((query) => query.table === "product_applications");
    const inserted = links.find((query) => opNames(query)[0] === "insert");
    const deleted = links.find((query) => opNames(query)[0] === "delete");
    expect(inserted?.ops[0].args[0]).toEqual([{ product_id: ID, application_id: APP_C }]);
    expect(deleted?.ops).toContainEqual({ name: "eq", args: ["product_id", ID] });
    expect(deleted?.ops).toContainEqual({ name: "in", args: ["application_id", [APP_A]] });
    // Adds go in first, so a failure part-way never leaves the product with fewer links than before.
    expect(queries.indexOf(inserted!)).toBeLessThan(queries.indexOf(deleted!));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("changes no links when the selection is unchanged, and removes all when none is ticked", async () => {
    const same = fakeSupabase((query) =>
      query.table === "product_applications" ? { data: [{ application_id: APP_A }] } : { data: [{ id: ID }] },
    );
    await saveProduct(null, form({ ...fields, id: ID, application_ids: [APP_A] }));
    expect(
      same.queries.filter((q) => q.table === "product_applications" && ["insert", "delete"].includes(opNames(q)[0])),
    ).toEqual([]);

    const none = fakeSupabase((query) =>
      query.table === "product_applications" ? { data: [{ application_id: APP_A }] } : { data: [{ id: ID }] },
    );
    await saveProduct(null, form({ ...fields, id: ID }));
    const deleted = none.queries.find((q) => q.table === "product_applications" && opNames(q)[0] === "delete");
    expect(deleted?.ops).toContainEqual({ name: "in", args: ["application_id", [APP_A]] });
  });

  it("shows 'This URL slug is already used' on the slug field for a duplicate, and does not touch the links (Review Focus 4)", async () => {
    const { queries } = fakeSupabase(() => ({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "products_slug_key"',
        details: "Key (slug)=(pp-biaxial-geogrid) already exists.",
      },
    }));
    const result = await saveProduct(null, form({ ...fields, slug: "pp-biaxial-geogrid", application_ids: [APP_A] }));
    expect(result).toEqual({ ok: false, errors: { slug: "This URL slug is already used" } });
    expect(queries.filter((query) => query.table === "product_applications")).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says so on the category field when the category was deleted in the meantime", async () => {
    fakeSupabase(() => ({
      error: {
        code: "23503",
        message: 'insert or update on table "products" violates foreign key constraint "products_category_id_fkey"',
      },
    }));
    const result = await saveProduct(null, form(fields));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.category_id).toMatch(/no longer exists/i);
  });

  it("says so when the product was deleted in the meantime", async () => {
    fakeSupabase(() => ({ data: [] }));
    const result = await saveProduct(null, form({ ...fields, id: ID }));
    expect(result.ok === false && result.errors.form).toMatch(/no longer exists/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still refreshes the site when the row was saved but the application links failed, and says so", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeSupabase((query) =>
      query.table === "product_applications"
        ? { error: { code: "23503", message: 'violates foreign key constraint "product_applications_application_id_fkey"' } }
        : { data: [{ id: ID }] },
    );
    const result = await saveProduct(null, form({ ...fields, id: ID, application_ids: [APP_A] }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.form).toMatch(/applications/i);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    log.mockRestore();
  });

  it("returns a plain message for an unexpected database error, never the database text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeSupabase(() => ({ error: { code: "XX000", message: "secret internal detail" } }));
    const result = await saveProduct(null, form(fields));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret internal detail");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("refuses an id that is not an id", async () => {
    const { queries } = fakeSupabase();
    const result = await saveProduct(null, form({ ...fields, id: "1 or 1=1" }));
    expect(result.ok).toBe(false);
    expect(queries).toEqual([]);
  });

  describe("publishing with the seeded datasheet reminder still in the overview (Ruling R9)", () => {
    const overview = "Text.\n\n_Typical values. Confirm against the manufacturer's datasheet before publishing._";

    it("saves nothing and asks for a confirmation", async () => {
      const { queries } = fakeSupabase();
      const result = await saveProduct(null, form({ ...fields, id: ID, overview, published: "on" }));
      expect(result.ok).toBe(false);
      expect(result.ok === false && Object.keys(result.errors)).toEqual(["publish_confirm"]);
      expect(result.ok === false && result.errors.publish_confirm).toMatch(/datasheet/i);
      expect(queries).toEqual([]);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("saves as published once the admin ticks the confirmation", async () => {
      const { queries } = fakeSupabase();
      const result = await saveProduct(null, form({ ...fields, id: ID, overview, published: "on", confirm_unverified: "on" }));
      expect(result).toEqual({ ok: true });
      expect(queries[0].ops[0].args[0]).toMatchObject({ published: true, overview });
      expect(queries[0].ops[0].args[0]).not.toHaveProperty("confirm_unverified");
    });

    it("saves a draft without asking", async () => {
      fakeSupabase();
      expect(await saveProduct(null, form({ ...fields, id: ID, overview }))).toEqual({ ok: true });
    });

    it("saves as published without asking once the line is removed", async () => {
      fakeSupabase();
      expect(await saveProduct(null, form({ ...fields, id: ID, overview: "Text.", published: "on" }))).toEqual({ ok: true });
    });
  });
});

describe("deleteProduct", () => {
  it("deletes by id (spec rows and links go with it), refreshes the whole site and reports success", async () => {
    const { queries } = fakeSupabase();
    await expect(deleteProduct(ID)).resolves.toEqual({ ok: true });
    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe("products");
    expect(opNames(queries[0])).toContain("delete");
    expect(queries[0].ops).toContainEqual({ name: "eq", args: ["id", ID] });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses an id that is not an id", async () => {
    const { queries } = fakeSupabase();
    const result = await deleteProduct("not-an-id");
    expect(result.ok).toBe(false);
    expect(queries).toEqual([]);
  });

  it("returns a plain message when the database refuses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeSupabase(() => ({ error: { code: "XX000", message: "secret internal detail" } }));
    const result = await deleteProduct(ID);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret internal detail");
    expect(revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("saveSpecGrid", () => {
  const grid = {
    models: ["BX1515", "BX2020"],
    rows: [{ name: "Tensile strength", unit: "kN/m", testMethod: "ASTM D6637", values: ["15", null] }],
  };

  it("sends the grid to save_spec_table in the RPC's shape, refreshes the whole site and reports success", async () => {
    const { rpcCalls, queries } = fakeSupabase();
    await expect(saveSpecGrid(ID, grid)).resolves.toEqual({ ok: true });
    expect(rpcCalls).toEqual([
      {
        name: "save_spec_table",
        args: {
          p_product_id: ID,
          p_grid: {
            models: ["BX1515", "BX2020"],
            rows: [{ name: "Tensile strength", unit: "kN/m", test_method: "ASTM D6637", values: ["15", ""] }],
          },
        },
      },
    ]);
    // Everything goes through the one RPC (one transaction), not through table writes.
    expect(queries).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("trims the texts before sending them", async () => {
    const { rpcCalls } = fakeSupabase();
    await saveSpecGrid(ID, { models: [" BX1 "], rows: [{ name: " Strength ", unit: "  ", testMethod: null, values: [" 5 "] }] });
    expect(rpcCalls[0].args.p_grid).toEqual({
      models: ["BX1"],
      rows: [{ name: "Strength", unit: "", test_method: "", values: ["5"] }],
    });
  });

  it("rejects duplicate model codes and does not call the database", async () => {
    const { rpcCalls } = fakeSupabase();
    const result = await saveSpecGrid(ID, { models: ["BX1515", "BX1515"], rows: [] });
    expect(result.ok).toBe(false);
    expect(result.ok === false && Object.keys(result.errors).sort()).toEqual(["models.0", "models.1"]);
    expect(rpcCalls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a blank model code and a blank property name, keyed by position", async () => {
    const { rpcCalls } = fakeSupabase();
    const result = await saveSpecGrid(ID, {
      models: ["BX1515", " "],
      rows: [{ name: "", unit: null, testMethod: null, values: [null, null] }],
    });
    expect(result.ok === false && Object.keys(result.errors).sort()).toEqual(["models.1", "rows.0.name"]);
    expect(rpcCalls).toEqual([]);
  });

  it("rejects a malformed grid sent by a hand-made request, without throwing", async () => {
    const { rpcCalls } = fakeSupabase();
    for (const bad of [null, undefined, "x", { models: "A" }, { models: [], rows: [{}] }]) {
      const result = await saveSpecGrid(ID, bad as never);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
    expect(rpcCalls).toEqual([]);
  });

  it("refuses a product id that is not an id", async () => {
    const { rpcCalls } = fakeSupabase();
    const result = await saveSpecGrid("not-an-id", grid);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("says so when the product no longer exists (the RPC raises P0002), without refreshing the site", async () => {
    fakeSupabase(undefined, () => ({ error: { code: "P0002", message: `Product ${ID} not found` } }));
    const result = await saveSpecGrid(ID, grid);
    expect(result.ok === false && result.errors.form).toMatch(/no longer exists/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("never shows database text: a rejected grid or an unexpected error becomes a plain message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const error of [
      { code: "22023", message: 'Row "Strength" has 1 values but there are 2 models' },
      { code: "42501", message: "Only admins can save a spec table" },
      { code: "XX000", message: "secret internal detail" },
      { code: "22P05", message: "unsupported Unicode escape sequence" },
    ]) {
      fakeSupabase(undefined, () => ({ error }));
      const result = await saveSpecGrid(ID, grid);
      expect(result.ok, error.code).toBe(false);
      const text = JSON.stringify(result);
      expect(text, error.code).not.toContain(error.message);
      expect(text, error.code).not.toContain("Strength");
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("returns a plain message when the call itself throws (network down)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = createFakeSupabase({});
    supabase.rpc = () => Promise.reject(new Error("fetch failed: ECONNREFUSED")) as never;
    requireAdmin.mockResolvedValue({ userId: "admin-1", supabase });
    const result = await saveSpecGrid(ID, grid);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

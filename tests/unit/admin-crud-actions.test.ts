import { beforeEach, describe, expect, it, vi } from "vitest";

// The save and delete Server Actions of categories, applications, certifications and projects
// against a fake Supabase client: that every one checks for an admin before anything else,
// what is written, and how database errors come back. The real thing (RLS, the browser, the
// public pages changing) runs in tests/e2e/admin-crud.spec.ts.

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

const categories = await import("@/app/admin/(protected)/categories/actions");
const applications = await import("@/app/admin/(protected)/applications/actions");
const certifications = await import("@/app/admin/(protected)/certifications/actions");
const projects = await import("@/app/admin/(protected)/projects/actions");

type Op = { name: string; args: unknown[] };
type Query = { table: string; ops: Op[] };
type Outcome = { data?: unknown; error?: { code?: string; message: string; details?: string } | null };

/** A Supabase client that records every query and answers each one with `answer(query)`. */
function fakeSupabase(answer: (query: Query) => Outcome = () => ({ data: [{ id: ID }] })) {
  const queries: Query[] = [];
  const supabase = {
    from(table: string) {
      const query: Query = { table, ops: [] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const name of ["insert", "update", "delete", "select", "eq", "in", "single", "order"]) {
        builder[name] = (...args: unknown[]) => {
          query.ops.push({ name, args });
          return builder;
        };
      }
      builder.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) => {
        const outcome = answer(query);
        return Promise.resolve(resolve({ data: outcome.data ?? null, error: outcome.error ?? null }));
      };
      return builder;
    },
  };
  requireAdmin.mockResolvedValue({ userId: "admin-1", supabase });
  return { supabase, queries };
}

const ID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";
const PRODUCT_A = "7c1d9a44-2f0e-4b8a-a3d5-1e9c6b7f8a20";
const PRODUCT_B = "9d2e8b55-3a1f-4c9b-b4e6-2f0d7c8a9b31";
const PRODUCT_C = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

const opNames = (query: Query) => query.ops.map((op) => op.name);

beforeEach(() => {
  requireAdmin.mockReset();
  revalidatePath.mockReset();
});

describe("every action checks for an admin first", () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["saveCategory", () => categories.saveCategory(null, form({ name: "A" }))],
    ["deleteCategory", () => categories.deleteCategory(ID)],
    ["saveApplication", () => applications.saveApplication(null, form({ name: "A" }))],
    ["deleteApplication", () => applications.deleteApplication(ID)],
    ["saveCertification", () => certifications.saveCertification(null, form({ name: "A" }))],
    ["deleteCertification", () => certifications.deleteCertification(ID)],
    ["saveProject", () => projects.saveProject(null, form({ title: "A", country: "IN" }))],
    ["deleteProject", () => projects.deleteProject(ID)],
  ];

  it.each(cases)("%s sends a visitor to the login page and touches nothing", async (_name, run) => {
    requireAdmin.mockImplementation(() => {
      throw new Error("REDIRECT /admin/login");
    });
    await expect(run()).rejects.toThrow("REDIRECT /admin/login");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveCategory", () => {
  it("returns field errors without touching the database", async () => {
    const { queries } = fakeSupabase();
    const result = await categories.saveCategory(null, form({ name: "", sort_order: "x" }));
    expect(result).toEqual({ ok: false, errors: { name: "Enter a name", sort_order: "Enter a whole number" } });
    expect(queries).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("creates the category, refreshes the whole site and goes back to the list", async () => {
    const { queries } = fakeSupabase();
    await expect(
      categories.saveCategory(null, form({ name: "Geo Net", slug: "", intro: "Nets", sort_order: "5", published: "on" })),
    ).rejects.toThrow("REDIRECT /admin/categories");

    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe("categories");
    expect(opNames(queries[0])[0]).toBe("insert");
    expect(queries[0].ops[0].args[0]).toEqual({
      name: "Geo Net",
      slug: "geo-net",
      intro: "Nets",
      image_path: null,
      sort_order: 5,
      published: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("updates the category named by the hidden id and stays on the page", async () => {
    const { queries } = fakeSupabase();
    const result = await categories.saveCategory(null, form({ id: ID, name: "Geo Net", slug: "geo-net" }));

    expect(result).toEqual({ ok: true });
    expect(queries).toHaveLength(1);
    expect(opNames(queries[0])).toContain("update");
    expect(queries[0].ops).toContainEqual({ name: "eq", args: ["id", ID] });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("shows 'This URL slug is already used' on the slug field for a duplicate, with no refresh (Review Focus 4)", async () => {
    fakeSupabase(() => ({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "categories_slug_key"',
        details: "Key (slug)=(geogrid) already exists.",
      },
    }));
    const result = await categories.saveCategory(null, form({ name: "Another Geogrid", slug: "geogrid" }));
    expect(result).toEqual({ ok: false, errors: { slug: "This URL slug is already used" } });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says so when the category was deleted in the meantime", async () => {
    fakeSupabase(() => ({ data: [] }));
    const result = await categories.saveCategory(null, form({ id: ID, name: "Gone" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.form).toMatch(/no longer exists/i);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an id that is not an id", async () => {
    const { queries } = fakeSupabase();
    const result = await categories.saveCategory(null, form({ id: "1 or 1=1", name: "A" }));
    expect(result.ok).toBe(false);
    expect(queries).toEqual([]);
  });

  it("returns a plain message for an unexpected database error, never the database text", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeSupabase(() => ({ error: { code: "XX000", message: "secret internal detail" } }));
    const result = await categories.saveCategory(null, form({ name: "A" }));
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret internal detail");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("deleteCategory", () => {
  it("deletes by id, refreshes the whole site and reports success", async () => {
    const { queries } = fakeSupabase();
    await expect(categories.deleteCategory(ID)).resolves.toEqual({ ok: true });
    expect(queries[0].table).toBe("categories");
    expect(opNames(queries[0])).toContain("delete");
    expect(queries[0].ops).toContainEqual({ name: "eq", args: ["id", ID] });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("explains that a category with products cannot be deleted (Ruling R13)", async () => {
    fakeSupabase(() => ({
      error: {
        code: "23503",
        message:
          'update or delete on table "categories" violates foreign key constraint "products_category_id_fkey" on table "products"',
      },
    }));
    await expect(categories.deleteCategory(ID)).resolves.toEqual({
      ok: false,
      errors: { form: "This category still has products. Move or delete them first." },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an id that is not an id", async () => {
    const { queries } = fakeSupabase();
    const result = await categories.deleteCategory("not-an-id");
    expect(result.ok).toBe(false);
    expect(queries).toEqual([]);
  });
});

describe("saveApplication", () => {
  it("creates an application with a slug from its name and goes to the list", async () => {
    const { queries } = fakeSupabase();
    await expect(applications.saveApplication(null, form({ name: "Mine Haul Roads", body: "## Text" }))).rejects.toThrow(
      "REDIRECT /admin/applications",
    );
    expect(queries[0].table).toBe("applications");
    expect(queries[0].ops[0].args[0]).toMatchObject({ slug: "mine-haul-roads", body: "## Text", published: false });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reports a duplicate slug on the slug field", async () => {
    fakeSupabase(() => ({ error: { code: "23505", message: 'duplicate key ... "applications_slug_key"' } }));
    await expect(applications.saveApplication(null, form({ name: "Railways" }))).resolves.toEqual({
      ok: false,
      errors: { slug: "This URL slug is already used" },
    });
  });

  it("deletes by id", async () => {
    const { queries } = fakeSupabase();
    await expect(applications.deleteApplication(ID)).resolves.toEqual({ ok: true });
    expect(queries[0].table).toBe("applications");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("saveCertification", () => {
  it("creates a certification with its dates and files", async () => {
    const { queries } = fakeSupabase();
    await expect(
      certifications.saveCertification(
        null,
        form({ name: "ISO 9001", issuer: "BV", valid_until: "2028-03-31", file_path: "certifications/a-b.pdf", image_path: "certifications/c-d.png" }),
      ),
    ).rejects.toThrow("REDIRECT /admin/certifications");
    expect(queries[0].table).toBe("certifications");
    expect(queries[0].ops[0].args[0]).toEqual({
      name: "ISO 9001",
      issuer: "BV",
      valid_until: "2028-03-31",
      file_path: "certifications/a-b.pdf",
      image_path: "certifications/c-d.png",
      sort_order: 0,
      published: false,
    });
  });

  it("rejects an impossible date on the date field", async () => {
    const { queries } = fakeSupabase();
    const result = await certifications.saveCertification(null, form({ name: "ISO", valid_until: "2027-02-30" }));
    expect(result).toEqual({ ok: false, errors: { valid_until: "Enter a valid date" } });
    expect(queries).toEqual([]);
  });

  it("deletes by id", async () => {
    fakeSupabase();
    await expect(certifications.deleteCertification(ID)).resolves.toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("saveProject", () => {
  const fields = { title: "Port Expansion", country: "AE", images: ["projects/a-1.jpg", "projects/b-2.jpg"] };

  it("updates the project row, then adds the new product links and removes the dropped ones", async () => {
    const { queries } = fakeSupabase((query) => {
      if (query.table === "project_products" && query.ops[0].name === "select") {
        return { data: [{ product_id: PRODUCT_A }, { product_id: PRODUCT_B }] };
      }
      return { data: [{ id: ID }] };
    });

    const result = await projects.saveProject(null, form({ ...fields, id: ID, product_ids: [PRODUCT_B, PRODUCT_C] }));
    expect(result).toEqual({ ok: true });

    expect(queries[0].table).toBe("projects");
    expect(queries[0].ops[0].name).toBe("update");
    // The linked product ids belong to project_products, not to the projects row.
    const row = queries[0].ops[0].args[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("product_ids");
    expect(row).toMatchObject({ title: "Port Expansion", slug: "port-expansion", country: "AE", images: fields.images });

    const links = queries.filter((query) => query.table === "project_products");
    const inserted = links.find((query) => opNames(query)[0] === "insert");
    const deleted = links.find((query) => opNames(query)[0] === "delete");
    expect(inserted?.ops[0].args[0]).toEqual([{ project_id: ID, product_id: PRODUCT_C }]);
    expect(deleted?.ops).toContainEqual({ name: "eq", args: ["project_id", ID] });
    expect(deleted?.ops).toContainEqual({ name: "in", args: ["product_id", [PRODUCT_A]] });
    // New links go in before old ones come out, so a failure never leaves a project with none.
    expect(queries.indexOf(inserted!)).toBeLessThan(queries.indexOf(deleted!));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("changes no links when the selection is unchanged", async () => {
    const { queries } = fakeSupabase((query) =>
      query.table === "project_products" ? { data: [{ product_id: PRODUCT_A }] } : { data: [{ id: ID }] },
    );
    await projects.saveProject(null, form({ ...fields, id: ID, product_ids: [PRODUCT_A] }));
    const writes = queries.filter((query) => query.table === "project_products" && ["insert", "delete"].includes(opNames(query)[0]));
    expect(writes).toEqual([]);
  });

  it("creates a project, links its products with the new id and goes to the list", async () => {
    const { queries } = fakeSupabase((query) => {
      if (query.table === "projects") return { data: { id: ID } };
      return { data: [] };
    });
    await expect(projects.saveProject(null, form({ ...fields, product_ids: [PRODUCT_A] }))).rejects.toThrow(
      "REDIRECT /admin/projects",
    );
    expect(queries[0].ops[0].name).toBe("insert");
    const inserted = queries.find((query) => query.table === "project_products" && opNames(query)[0] === "insert");
    expect(inserted?.ops[0].args[0]).toEqual([{ project_id: ID, product_id: PRODUCT_A }]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reports a duplicate slug and does not touch the links", async () => {
    const { queries } = fakeSupabase(() => ({
      error: { code: "23505", message: 'duplicate key value violates unique constraint "projects_slug_key"' },
    }));
    const result = await projects.saveProject(null, form({ ...fields, product_ids: [PRODUCT_A] }));
    expect(result).toEqual({ ok: false, errors: { slug: "This URL slug is already used" } });
    expect(queries.filter((query) => query.table === "project_products")).toEqual([]);
  });

  it("still refreshes the site when the row was saved but the links failed, and says so", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeSupabase((query) =>
      query.table === "project_products"
        ? { error: { code: "23503", message: 'violates foreign key constraint "project_products_product_id_fkey"' } }
        : { data: [{ id: ID }] },
    );
    const result = await projects.saveProject(null, form({ ...fields, id: ID, product_ids: [PRODUCT_A] }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.form).toBeTruthy();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    log.mockRestore();
  });

  it("deletes by id", async () => {
    const { queries } = fakeSupabase();
    await expect(projects.deleteProject(ID)).resolves.toEqual({ ok: true });
    expect(queries[0].table).toBe("projects");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_GONE_MESSAGE } from "@/lib/admin/action-result";
import {
  CATEGORY_NAME_TAKEN_MESSAGE,
  DOCUMENT_FILE_MESSAGE,
  documentCategorySchema,
  documentFolder,
  documentUpdateSchema,
  groupDocuments,
  isDocumentPathOf,
  newDocumentSchema,
  type DocumentRow,
} from "@/lib/admin/documents";
import { parseForm } from "@/lib/admin/schemas";
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, checkUpload } from "@/lib/admin/upload";
import { createFakeSupabase, type Outcome, type Query, type StorageCall } from "../support/fake-supabase";

// Purchase documents and their categories: the form schemas, the grouping on the purchase page and
// the Server Actions against a fake Supabase client. RLS and the bucket's limits run in tests/db.

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/require-admin", () => ({ requireAdmin: () => requireAdmin() }));

const { deletePurchaseDocument, savePurchaseDocument } = await import(
  "@/app/admin/(protected)/purchases/document-actions"
);
const { deletePurchase } = await import("@/app/admin/(protected)/purchases/actions");
const { deleteDocumentCategory, saveDocumentCategory } = await import(
  "@/app/admin/(protected)/document-categories/actions"
);

const PURCHASE_ID = "1c6f3d2e-9e8b-4d4c-8f32-6b7a8e9d0c21";
const OTHER_PURCHASE_ID = "4f9c6a5b-2b1e-4a7f-9c65-9e0d1b2a3f54";
const DOCUMENT_ID = "2d7a4e3f-0f9c-4e5d-9a43-7c8b9f0e1d32";
const CATEGORY_ID = "3e8b5f4a-1a0d-4f6e-8b54-8d9c0a1f2e43";
const FILE = `purchases/${PURCHASE_ID}/0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10-commercial-invoice.pdf`;

function fakeSupabase(answer?: (query: Query) => Outcome, answerStorage?: (call: StorageCall) => Outcome) {
  const fake = createFakeSupabase({
    answer: answer ?? (() => ({ data: [{ id: DOCUMENT_ID, purchase_id: PURCHASE_ID, file_path: FILE }] })),
    answerStorage,
  });
  requireAdmin.mockResolvedValue({ userId: "admin-1", supabase: fake.supabase });
  return fake;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const opNames = (query: Query) => query.ops.map((op) => op.name);

beforeEach(() => {
  requireAdmin.mockReset();
  revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("document paths", () => {
  it("keeps a purchase's files in its own folder", () => {
    expect(documentFolder(PURCHASE_ID.toUpperCase())).toBe(`purchases/${PURCHASE_ID}`);
    expect(isDocumentPathOf(PURCHASE_ID, FILE)).toBe(true);
  });

  it.each([
    ["another purchase's file", FILE.replace(PURCHASE_ID, OTHER_PURCHASE_ID)],
    ["a deeper folder", `purchases/${PURCHASE_ID}/x/y.pdf`],
    ["a climb out", `purchases/${PURCHASE_ID}/../${OTHER_PURCHASE_ID}/y.pdf`],
    ["a public-media path", "products/y.pdf"],
    ["the bare folder", `purchases/${PURCHASE_ID}/`],
  ])("refuses %s", (_name, path) => {
    expect(isDocumentPathOf(PURCHASE_ID, path)).toBe(false);
  });
});

describe("document schemas", () => {
  it("takes the file name as the title when none is typed", () => {
    const parsed = parseForm(newDocumentSchema, form({ purchase_id: PURCHASE_ID, file_path: FILE, category_id: "", document_date: "" }));
    expect(parsed).toEqual({
      ok: true,
      data: { purchase_id: PURCHASE_ID, category_id: null, file_path: FILE, title: "commercial-invoice.pdf", document_date: null, notes: "" },
    });
  });

  it("asks for the file, and refuses a path outside the purchase's folder", () => {
    const missing = parseForm(newDocumentSchema, form({ purchase_id: PURCHASE_ID, file_path: "" }));
    expect(missing).toMatchObject({ ok: false, errors: { file_path: DOCUMENT_FILE_MESSAGE } });
    const elsewhere = parseForm(newDocumentSchema, form({ purchase_id: PURCHASE_ID, file_path: FILE.replace(PURCHASE_ID, OTHER_PURCHASE_ID) }));
    expect(elsewhere).toMatchObject({ ok: false, errors: { file_path: "Upload the file again." } });
  });

  it("checks the category and the date", () => {
    const bad = parseForm(newDocumentSchema, form({ purchase_id: PURCHASE_ID, file_path: FILE, category_id: "x", document_date: "2025-02-30" }));
    expect(bad).toMatchObject({ ok: false, errors: { category_id: "Choose a category from the list", document_date: "Enter a valid date" } });
  });

  it("needs a title when a document is edited", () => {
    expect(parseForm(documentUpdateSchema, form({ purchase_id: PURCHASE_ID, title: " " }))).toMatchObject({
      ok: false,
      errors: { title: "Enter a title" },
    });
    expect(parseForm(documentUpdateSchema, form({ purchase_id: PURCHASE_ID, title: "Bill of entry", category_id: CATEGORY_ID, document_date: "2024-08-02" }))).toEqual({
      ok: true,
      data: { purchase_id: PURCHASE_ID, category_id: CATEGORY_ID, title: "Bill of entry", document_date: "2024-08-02", notes: "" },
    });
  });

  it("reads a category's name and order", () => {
    expect(parseForm(documentCategorySchema, form({ name: " Insurance ", sort_order: "" }))).toEqual({ ok: true, data: { name: "Insurance", sort_order: 0 } });
    expect(parseForm(documentCategorySchema, form({ name: "Insurance", sort_order: "-5" }))).toEqual({ ok: true, data: { name: "Insurance", sort_order: -5 } });
    expect(parseForm(documentCategorySchema, form({ name: "", sort_order: "1.5" }))).toMatchObject({
      ok: false,
      errors: { name: "Enter a name", sort_order: "Enter a whole number, for example 10" },
    });
  });
});

describe("document uploads", () => {
  it.each([
    ["scan.pdf", "application/pdf"],
    ["photo.jpg", "image/jpeg"],
    ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["old.xls", "application/vnd.ms-excel"],
    ["letter.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["list.csv", "text/csv"],
  ])("accepts %s", (name, type) => {
    expect(checkUpload({ name, type, size: 1000 }, DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES)).toBeNull();
  });

  it("refuses other types and files over 20 MB", () => {
    expect(checkUpload({ name: "page.html", type: "text/html", size: 10 }, DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES)).toMatch(/not an allowed file type/);
    expect(checkUpload({ name: "big.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES + 1 }, DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES)).toMatch(/larger than 20 MB/);
  });
});

describe("groupDocuments", () => {
  const doc = (id: string, category: string | null): DocumentRow => ({
    id,
    category_id: category,
    title: id,
    file_path: `purchases/${PURCHASE_ID}/${id}.pdf`,
    document_date: null,
    notes: "",
    created_at: "2026-10-22T00:00:00Z",
  });

  it("files documents in the categories' order, leaves out empty categories, and puts the rest last", () => {
    const categories = [
      { id: "a", name: "Invoice", sort_order: 10 },
      { id: "b", name: "Packing list", sort_order: 20 },
      { id: "c", name: "Bill of entry", sort_order: 30 },
    ];
    const groups = groupDocuments([doc("1", "c"), doc("2", null), doc("3", "a"), doc("4", "gone"), doc("5", "c")], categories);
    expect(groups.map((group) => [group.category?.name ?? null, group.documents.map((d) => d.id)])).toEqual([
      ["Invoice", ["3"]],
      ["Bill of entry", ["1", "5"]],
      [null, ["2", "4"]],
    ]);
  });
});

describe("document actions", () => {
  it.each([
    ["savePurchaseDocument", () => savePurchaseDocument(null, form({ purchase_id: PURCHASE_ID, file_path: FILE }))],
    ["deletePurchaseDocument", () => deletePurchaseDocument(DOCUMENT_ID)],
    ["saveDocumentCategory", () => saveDocumentCategory(null, form({ name: "Insurance" }))],
    ["deleteDocumentCategory", () => deleteDocumentCategory(CATEGORY_ID)],
  ] as const)("%s sends a visitor to the login page and touches nothing", async (_name, run) => {
    const { queries, storageCalls } = createFakeSupabase({});
    requireAdmin.mockImplementation(() => {
      throw new Error("REDIRECT /admin/login");
    });
    await expect(run()).rejects.toThrow("REDIRECT /admin/login");
    expect(queries).toEqual([]);
    expect(storageCalls).toEqual([]);
  });

  it("files a new document with its purchase", async () => {
    const { queries } = fakeSupabase();
    const result = await savePurchaseDocument(null, form({ purchase_id: PURCHASE_ID, file_path: FILE, category_id: CATEGORY_ID, title: "Invoice AL240618" }));
    expect(result).toEqual({ ok: true });
    expect(queries[0].table).toBe("purchase_documents");
    expect(queries[0].ops[0]).toEqual({
      name: "insert",
      args: [{ purchase_id: PURCHASE_ID, category_id: CATEGORY_ID, file_path: FILE, title: "Invoice AL240618", document_date: null, notes: "" }],
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/purchases/${PURCHASE_ID}`);
  });

  it("edits a document only within its own purchase, and never its file", async () => {
    const { queries } = fakeSupabase();
    const result = await savePurchaseDocument(null, form({ id: DOCUMENT_ID, purchase_id: PURCHASE_ID, title: "Bill of entry", file_path: "purchases/x/evil.pdf" }));
    expect(result).toEqual({ ok: true });
    expect(opNames(queries[0])).toEqual(["update", "eq", "eq", "select"]);
    expect(queries[0].ops[0].args[0]).toEqual({ category_id: null, title: "Bill of entry", document_date: null, notes: "" });
    expect(queries[0].ops[2].args).toEqual(["purchase_id", PURCHASE_ID]);
  });

  it("says so when the document or its category was deleted meanwhile", async () => {
    fakeSupabase(() => ({ data: [] }));
    expect(await savePurchaseDocument(null, form({ id: DOCUMENT_ID, purchase_id: PURCHASE_ID, title: "x" }))).toMatchObject({ ok: false });
    fakeSupabase(() => ({ error: { code: "23503", message: "violates foreign key constraint", details: "Key (category_id)=(…) is not present" } }));
    expect(await savePurchaseDocument(null, form({ purchase_id: PURCHASE_ID, file_path: FILE, category_id: CATEGORY_ID }))).toEqual({
      ok: false,
      errors: { category_id: CATEGORY_GONE_MESSAGE },
    });
  });

  it("deletes a document and then its file", async () => {
    const { queries, storageCalls } = fakeSupabase();
    expect(await deletePurchaseDocument(DOCUMENT_ID)).toEqual({ ok: true });
    expect(opNames(queries[0])).toEqual(["delete", "eq", "select"]);
    expect(storageCalls).toEqual([{ bucket: "purchase-documents", method: "remove", args: [[FILE]] }]);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/purchases/${PURCHASE_ID}`);
  });

  it("still reports the delete when the file could not be removed", async () => {
    fakeSupabase(undefined, () => ({ error: { message: "storage down" } }));
    expect(await deletePurchaseDocument(DOCUMENT_ID)).toEqual({ ok: true });
    expect(console.error).toHaveBeenCalled();
  });

  it("removes a purchase's document files when the purchase is deleted", async () => {
    const { queries, storageCalls } = fakeSupabase((query) =>
      query.table === "purchase_documents" ? { data: [{ file_path: FILE }, { file_path: `${FILE}-2` }] } : { data: [] },
    );
    expect(await deletePurchase(PURCHASE_ID)).toEqual({ ok: true });
    expect(queries.map((query) => query.table)).toEqual(["purchase_documents", "purchases"]);
    expect(storageCalls).toEqual([{ bucket: "purchase-documents", method: "remove", args: [[FILE, `${FILE}-2`]] }]);
  });

  it("keeps the files when deleting the purchase fails", async () => {
    const { storageCalls } = fakeSupabase((query) =>
      query.table === "purchase_documents" ? { data: [{ file_path: FILE }] } : { error: { code: "42501", message: "denied" } },
    );
    expect(await deletePurchase(PURCHASE_ID)).toMatchObject({ ok: false });
    expect(storageCalls).toEqual([]);
  });

  it("adds, renames and deletes categories", async () => {
    const { queries } = fakeSupabase(() => ({ data: [{ id: CATEGORY_ID }] }));
    expect(await saveDocumentCategory(null, form({ name: "Insurance", sort_order: "70" }))).toEqual({ ok: true });
    expect(queries[0].ops[0]).toEqual({ name: "insert", args: [{ name: "Insurance", sort_order: 70 }] });
    expect(await saveDocumentCategory(null, form({ id: CATEGORY_ID, name: "Insurance policy" }))).toEqual({ ok: true });
    expect(opNames(queries[1])).toEqual(["update", "eq", "select"]);
    expect(await deleteDocumentCategory(CATEGORY_ID)).toEqual({ ok: true });
    expect(opNames(queries[2])).toEqual(["delete", "eq"]);
  });

  it("refuses a second category with the same name", async () => {
    fakeSupabase(() => ({ error: { code: "23505", message: 'duplicate key value violates unique constraint "document_categories_name_key"' } }));
    expect(await saveDocumentCategory(null, form({ name: "packing list" }))).toEqual({ ok: false, errors: { name: CATEGORY_NAME_TAKEN_MESSAGE } });
  });

  it("refuses ids that are not ids before touching the database", async () => {
    const { queries } = fakeSupabase();
    expect(await deletePurchaseDocument("nope")).toMatchObject({ ok: false });
    expect(await deleteDocumentCategory("nope")).toMatchObject({ ok: false });
    expect(await savePurchaseDocument(null, form({ id: "nope", purchase_id: PURCHASE_ID }))).toMatchObject({ ok: false });
    expect(await saveDocumentCategory(null, form({ id: "nope", name: "x" }))).toMatchObject({ ok: false });
    expect(queries).toEqual([]);
  });
});

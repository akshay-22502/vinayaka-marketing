import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOTE_EMPTY_MESSAGE,
  buyerNoteSchema,
  buyerSchema,
  buyersHref,
  containsPattern,
  newBuyerSchema,
  parseBuyerFilters,
  websiteHref,
} from "@/lib/admin/buyers";
import { parseForm, parseInput } from "@/lib/admin/schemas";
import { createFakeSupabase, type Outcome, type Query } from "../support/fake-supabase";

// The wholesale buyers list: its filters, form schemas and Server Actions against a fake Supabase
// client. RLS, the trigger that applies a note's status and the screens run in tests/db and tests/e2e.

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/require-admin", () => ({ requireAdmin: () => requireAdmin() }));

const { addBuyerNote, deleteBuyer, deleteBuyerNote, saveBuyer } = await import("@/app/admin/(protected)/buyers/actions");

const BUYER_ID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";
const NOTE_ID = "1c6f3d2e-9e8b-4d4c-8f32-6b7a8e9d0c21";

function fakeSupabase(answer?: (query: Query) => Outcome) {
  const fake = createFakeSupabase({ answer: answer ?? (() => ({ data: [{ id: BUYER_ID, buyer_id: BUYER_ID }] })) });
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

describe("parseBuyerFilters and buyersHref", () => {
  it("reads known values and ignores the rest", () => {
    expect(parseBuyerFilters({ country: "AE", status: "in_discussion", q: "  dutco ", page: "2" })).toEqual({
      country: "AE",
      status: "in_discussion",
      q: "dutco",
      page: 2,
    });
    expect(parseBuyerFilters({ country: "US", status: "__proto__", page: "-1" })).toEqual({ country: null, status: null, q: "", page: 1 });
    expect(parseBuyerFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });

  it("writes only the filters that are set", () => {
    expect(buyersHref({})).toBe("/admin/buyers");
    expect(buyersHref({ country: "IN", status: "onboarded", q: "L&T", page: 3 })).toBe(
      "/admin/buyers?country=IN&status=onboarded&q=L%26T&page=3",
    );
    expect(buyersHref({ country: null, page: 1 })).toBe("/admin/buyers");
  });

  it("makes a search match only what was typed", () => {
    expect(containsPattern("dutco")).toBe("%dutco%");
    expect(containsPattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
});

describe("websiteHref", () => {
  it("links http(s) sites and adds https:// to a bare domain", () => {
    expect(websiteHref("https://www.dutcotennant.com")).toBe("https://www.dutcotennant.com/");
    expect(websiteHref("bmc-gulf.com")).toBe("https://bmc-gulf.com/");
  });

  it("does not link anything else", () => {
    expect(websiteHref("")).toBeNull();
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("not a site")).toBeNull();
    expect(websiteHref("localhost")).toBeNull();
  });
});

describe("buyer schemas", () => {
  it("a new buyer needs a company and a country, and starts at the chosen status", () => {
    expect(parseForm(newBuyerSchema, form({ company: " ", country: "", status: "not_contacted" }))).toEqual({
      ok: false,
      errors: { company: "Enter the company name", country: "Choose a country" },
    });
    const parsed = parseForm(newBuyerSchema, form({ company: " Dutco ", country: "AE", status: "contacted", priority: "high" }));
    expect(parsed).toMatchObject({ ok: true, data: { company: "Dutco", country: "AE", status: "contacted", priority: "high", email: "" } });
  });

  it("an existing buyer's details never carry a status, and a blank priority is null", () => {
    const parsed = parseForm(buyerSchema, form({ company: "Dutco", country: "AE", status: "onboarded", priority: "" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).not.toHaveProperty("status");
      expect(parsed.data.priority).toBeNull();
    }
    expect(parseForm(buyerSchema, form({ company: "x", country: "IN", priority: "urgent" }))).toEqual({
      ok: false,
      errors: { priority: "Choose a priority" },
    });
  });

  it("a note keeps the status only when it changed, and needs a note or a new status", () => {
    expect(parseInput(buyerNoteSchema, { status: "contacted", currentStatus: "contacted", body: " Called\r\nagain " })).toEqual({
      ok: true,
      data: { body: "Called\nagain", status: null },
    });
    expect(parseInput(buyerNoteSchema, { status: "onboarded", currentStatus: "quoted", body: "" })).toEqual({
      ok: true,
      data: { body: "", status: "onboarded" },
    });
    expect(parseInput(buyerNoteSchema, { status: "quoted", currentStatus: "quoted", body: "  " })).toEqual({
      ok: false,
      errors: { body: NOTE_EMPTY_MESSAGE },
    });
  });
});

describe("buyer actions", () => {
  it.each([
    ["saveBuyer", () => saveBuyer(null, form({ company: "x", country: "IN", status: "contacted" }))],
    ["deleteBuyer", () => deleteBuyer(BUYER_ID)],
    ["addBuyerNote", () => addBuyerNote(BUYER_ID, { status: "contacted", currentStatus: "", body: "x" })],
    ["deleteBuyerNote", () => deleteBuyerNote(NOTE_ID)],
  ] as const)("%s sends a visitor to the login page and touches nothing", async (_name, run) => {
    const { queries } = createFakeSupabase({});
    requireAdmin.mockImplementation(() => {
      throw new Error("REDIRECT /admin/login");
    });
    await expect(run()).rejects.toThrow("REDIRECT /admin/login");
    expect(queries).toEqual([]);
  });

  it("creating a buyer inserts it and opens its page", async () => {
    const { queries } = fakeSupabase(() => ({ data: { id: BUYER_ID } }));
    await expect(saveBuyer(null, form({ company: "Dutco", country: "AE", status: "contacted" }))).rejects.toThrow(
      `REDIRECT /admin/buyers/${BUYER_ID}`,
    );
    expect(queries[0].table).toBe("wholesale_buyers");
    expect(opNames(queries[0])).toEqual(["insert", "select", "single"]);
    expect(queries[0].ops[0].args[0]).toMatchObject({ company: "Dutco", country: "AE", status: "contacted" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/buyers");
  });

  it("saving an existing buyer updates its details only and refreshes only the admin buyer pages", async () => {
    const { queries } = fakeSupabase();
    await expect(saveBuyer(null, form({ id: BUYER_ID, company: "Dutco", country: "AE", status: "onboarded" }))).resolves.toEqual({ ok: true });
    expect(opNames(queries[0])).toEqual(["update", "eq", "select"]);
    expect(queries[0].ops[0].args[0]).not.toHaveProperty("status");
    expect(revalidatePath.mock.calls).toEqual([["/admin/buyers"], [`/admin/buyers/${BUYER_ID}`]]);
  });

  it("saving a buyer that was deleted meanwhile says so", async () => {
    fakeSupabase(() => ({ data: [] }));
    const result = await saveBuyer(null, form({ id: BUYER_ID, company: "Dutco", country: "AE" }));
    expect(result).toMatchObject({ ok: false, errors: { form: expect.stringMatching(/no longer exists/) } });
  });

  it("a bad id is refused before the database is asked", async () => {
    const { queries } = fakeSupabase();
    expect(await deleteBuyer("nope")).toMatchObject({ ok: false });
    expect(await addBuyerNote("nope", { status: "contacted", currentStatus: "", body: "x" })).toMatchObject({ ok: false });
    expect(await saveBuyer(null, form({ id: "nope", company: "x", country: "IN" }))).toMatchObject({ ok: false });
    expect(queries).toEqual([]);
  });

  it("adding a note inserts it with the changed status", async () => {
    const { queries } = fakeSupabase();
    await expect(addBuyerNote(BUYER_ID, { status: "quoted", currentStatus: "contacted", body: "Sent prices" })).resolves.toEqual({ ok: true });
    expect(queries[0].table).toBe("wholesale_buyer_notes");
    expect(queries[0].ops[0].args[0]).toEqual({ buyer_id: BUYER_ID, body: "Sent prices", status: "quoted" });
  });

  it("a note for a deleted buyer says the buyer is gone", async () => {
    fakeSupabase(() => ({ error: { code: "23503", message: "fk" } }));
    const result = await addBuyerNote(BUYER_ID, { status: "quoted", currentStatus: "quoted", body: "x" });
    expect(result).toMatchObject({ ok: false, errors: { form: expect.stringMatching(/no longer exists/) } });
  });

  it("deleting a note refreshes its buyer's page", async () => {
    const { queries } = fakeSupabase();
    await expect(deleteBuyerNote(NOTE_ID)).resolves.toEqual({ ok: true });
    expect(opNames(queries[0])).toEqual(["delete", "eq", "select"]);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/buyers/${BUYER_ID}`);
  });
});

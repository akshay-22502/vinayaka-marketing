import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPLIER_GONE_MESSAGE, SUPPLIER_HAS_PURCHASES_MESSAGE, fromPgError } from "@/lib/admin/action-result";
import {
  COST_KIND_LABELS,
  DEFAULT_COST_STEP,
  ITEM_NEEDS_PRODUCT_MESSAGE,
  PURCHASE_STEPS,
  STEP_COST_KINDS,
  deliveryStepSchema,
  effectiveRate,
  inCurrencies,
  paymentStepSchema,
  formatMoney,
  localCurrency,
  parsePurchaseFilters,
  purchaseCostSchema,
  purchaseItemSchema,
  portStepSchema,
  quotationStepSchema,
  purchaseSums,
  purchasesHref,
} from "@/lib/admin/purchases";
import { parseForm } from "@/lib/admin/schemas";
import { parseSupplierFilters, supplierSchema, suppliersHref } from "@/lib/admin/suppliers";
import { createFakeSupabase, type Outcome, type Query } from "../support/fake-supabase";

// Suppliers and purchases: the landed-cost sums, the filters, the form schemas and the Server
// Actions against a fake Supabase client. RLS and the screens run in tests/db and tests/e2e.

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const requireAdmin = vi.fn();
vi.mock("@/lib/admin/require-admin", () => ({ requireAdmin: () => requireAdmin() }));

const { deleteSupplier, saveSupplier } = await import("@/app/admin/(protected)/suppliers/actions");
const { deletePurchase, deletePurchaseCost, deletePurchaseItem, savePurchase, savePurchaseCost, savePurchaseItem } = await import(
  "@/app/admin/(protected)/purchases/actions"
);

const SUPPLIER_ID = "0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10";
const PURCHASE_ID = "1c6f3d2e-9e8b-4d4c-8f32-6b7a8e9d0c21";
const LINE_ID = "2d7a4e3f-0f9c-4e5d-9a43-7c8b9f0e1d32";
const PRODUCT_ID = "3e8b5f4a-1a0d-4f6e-8b54-8d9c0a1f2e43";

function fakeSupabase(answer?: (query: Query) => Outcome) {
  const fake = createFakeSupabase({ answer: answer ?? (() => ({ data: [{ id: LINE_ID, purchase_id: PURCHASE_ID }] })) });
  requireAdmin.mockResolvedValue({ userId: "admin-1", supabase: fake.supabase });
  return fake;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

const opNames = (query: Query) => query.ops.map((op) => op.name);

const purchaseForm = {
  supplier_id: SUPPLIER_ID,
  destination: "IN",
  status: "ordered",
  currency: "USD",
  exchange_rate: "83.5",
};

beforeEach(() => {
  requireAdmin.mockReset();
  revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("purchaseSums", () => {
  const purchase = { currency: "USD", exchange_rate: "80", destination: "IN" as const };

  it("prices per square metre or per roll, and shares the costs by value", () => {
    const sums = purchaseSums(
      purchase,
      [
        // 10 rolls of 350 m² at $0.50/m²: $1,750 = ₹1,40,000.
        { id: "a", rolls: 10, sqm_per_roll: "350", price_basis: "sqm", unit_price: "0.5" },
        // 5 rolls of 100 m² at $105/roll: $525 = ₹42,000.
        { id: "b", rolls: 5, sqm_per_roll: 100, price_basis: "roll", unit_price: 105 },
      ],
      [
        { amount: "1000", in_purchase_currency: true, in_landed_cost: true }, // ₹80,000 freight
        { amount: 102000, in_purchase_currency: false, in_landed_cost: true }, // ₹1,02,000 duty and the rest
        { amount: 30000, in_purchase_currency: false, in_landed_cost: false }, // IGST, claimed back
      ],
    );

    expect(sums.rolls).toBe(15);
    expect(sums.area).toBe(4000);
    expect(sums.goods).toBe(2275);
    expect(sums.goodsLocal).toBe(182000);
    expect(sums.costs).toBe(182000);
    expect(sums.excludedCosts).toBe(30000);
    expect(sums.landed).toBe(364000);
    expect(sums.landedPerSqm).toBe(91);

    const [a, b] = sums.lines;
    expect(a).toMatchObject({ area: 3500, pricePerSqm: 0.5, pricePerRoll: 175, goods: 1750, goodsLocal: 140000, costShare: 140000, landed: 280000 });
    expect(a.landedPerRoll).toBe(28000);
    expect(a.landedPerSqm).toBe(80);
    expect(b).toMatchObject({ area: 500, pricePerSqm: 1.05, pricePerRoll: 105, goods: 525, costShare: 42000, landed: 84000 });
    expect(b.landedPerSqm).toBe(168);
  });

  it("shares costs by area when every product was free, and keeps costs with no products in the total", () => {
    const free = purchaseSums(
      purchase,
      [
        { id: "a", rolls: 1, sqm_per_roll: 300, price_basis: "sqm", unit_price: 0 },
        { id: "b", rolls: 1, sqm_per_roll: 100, price_basis: "sqm", unit_price: 0 },
      ],
      [{ amount: 400, in_purchase_currency: false, in_landed_cost: true }],
    );
    expect(free.lines.map((line) => line.costShare)).toEqual([300, 100]);
    expect(free.landedPerSqm).toBe(1);

    const empty = purchaseSums(purchase, [], [{ amount: 500, in_purchase_currency: false, in_landed_cost: true }]);
    expect(empty).toMatchObject({ landed: 500, area: 0, landedPerSqm: null });
  });

  it("counts in rupees for India and dirhams for the UAE", () => {
    expect(localCurrency("IN")).toBe("INR");
    expect(localCurrency("AE")).toBe("AED");
    expect(formatMoney(125000, "INR")).toBe("₹1,25,000.00");
    expect(formatMoney(0.4567, "USD", 4)).toMatch(/0\.4567$/);
  });
});

describe("filters", () => {
  it("reads known purchase filters and ignores the rest", () => {
    expect(parsePurchaseFilters({ destination: "AE", status: "shipped", supplier: SUPPLIER_ID.toUpperCase(), page: "2" })).toEqual({
      destination: "AE",
      status: "shipped",
      supplier: SUPPLIER_ID,
      page: 2,
    });
    expect(parsePurchaseFilters({ destination: "CN", status: "lost", supplier: "x", page: "0" })).toEqual({
      destination: null,
      status: null,
      supplier: null,
      page: 1,
    });
    expect(purchasesHref({})).toBe("/admin/purchases");
    expect(purchasesHref({ destination: "IN", status: "arrived", supplier: SUPPLIER_ID, page: 3 })).toBe(
      `/admin/purchases?destination=IN&status=arrived&supplier=${SUPPLIER_ID}&page=3`,
    );
  });

  it("reads the supplier search", () => {
    expect(parseSupplierFilters({ q: "  Taian ", page: "x" })).toEqual({ q: "Taian", page: 1 });
    expect(suppliersHref({ q: "A&B", page: 2 })).toBe("/admin/suppliers?q=A%26B&page=2");
    expect(suppliersHref({ q: "" })).toBe("/admin/suppliers");
  });
});

describe("schemas", () => {
  it("a supplier needs a name and is in China unless another country is typed", () => {
    expect(parseForm(supplierSchema, form({ name: " " }))).toEqual({ ok: false, errors: { name: "Enter the company name" } });
    expect(parseForm(supplierSchema, form({ name: " Taian Geo ", country: "" }))).toMatchObject({
      ok: true,
      data: { name: "Taian Geo", country: "China", email: "" },
    });
  });

  it("a purchase needs a supplier, a country and an exchange rate above 0", () => {
    expect(parseForm(quotationStepSchema, form({ status: "ordered", currency: "USD", exchange_rate: "0" }))).toEqual({
      ok: false,
      errors: { supplier_id: "Choose a supplier", destination: "Choose where the goods go", exchange_rate: "Enter a number above 0" },
    });
    const parsed = parseForm(quotationStepSchema, form({ ...purchaseForm, exchange_rate: " 1,083.25 ", order_date: "2026-10-20", incoterm: "FOB" }));
    expect(parsed).toMatchObject({
      ok: true,
      data: { exchange_rate: 1083.25, order_date: "2026-10-20", quotation_date: null, incoterm: "FOB" },
    });
    expect(parseForm(quotationStepSchema, form({ ...purchaseForm, exchange_rate: "abc", order_date: "2026-02-30", incoterm: "XYZ" }))).toEqual({
      ok: false,
      errors: { exchange_rate: "Enter a number, for example 12.5", order_date: "Enter a valid date", incoterm: "Choose the delivery terms" },
    });
    expect(parseForm(portStepSchema, form({ container_type: "40ft_hc", arrival_date: "2026-11-02" }))).toMatchObject({
      ok: true,
      data: { container_type: "40ft_hc", container_count: 1, arrival_date: "2026-11-02", bill_of_entry_number: "" },
    });
    expect(parseForm(portStepSchema, form({ container_count: "1.5" }))).toMatchObject({ ok: false, errors: { container_count: "Enter a whole number" } });
  });

  it("a product line needs a product or a description, rolls, a roll size and a price", () => {
    expect(parseForm(purchaseItemSchema, form({ purchase_id: PURCHASE_ID, price_basis: "sqm", rolls: "", sqm_per_roll: "", unit_price: "" }))).toEqual({
      ok: false,
      errors: {
        product_id: ITEM_NEEDS_PRODUCT_MESSAGE,
        rolls: "Enter the number of rolls",
        sqm_per_roll: "Enter the square metres in one roll",
        unit_price: "Enter the price",
      },
    });
    expect(parseForm(purchaseItemSchema, form({ purchase_id: PURCHASE_ID, price_basis: "sqm", rolls: "2", sqm_per_roll: "350", unit_price: "0.5" }))).toEqual({
      ok: false,
      errors: { product_id: ITEM_NEEDS_PRODUCT_MESSAGE },
    });
    expect(
      parseForm(purchaseItemSchema, form({ purchase_id: PURCHASE_ID, description: "PET 100 kN", price_basis: "sqm", rolls: "2", sqm_per_roll: "350", unit_price: "1" })),
    ).toMatchObject({ ok: true, data: { product_id: null, description: "PET 100 kN" } });
    expect(
      parseForm(
        purchaseItemSchema,
        form({ purchase_id: PURCHASE_ID, product_id: PRODUCT_ID, price_basis: "roll", rolls: "1,200", sqm_per_roll: "350", unit_price: "0" }),
      ),
    ).toMatchObject({ ok: true, data: { product_id: PRODUCT_ID, description: "", rolls: 1200, sqm_per_roll: 350, unit_price: 0 } });
  });

  it("a cost is in the supplier's currency or the local one, and counts in the landed cost only when ticked", () => {
    expect(
      parseForm(purchaseCostSchema, form({ purchase_id: PURCHASE_ID, kind: "freight", amount: "1,500", paid_in: "purchase", in_landed_cost: "on" })),
    ).toEqual({
      ok: true,
      data: { purchase_id: PURCHASE_ID, stage: "port", kind: "freight", description: "", amount: 1500, in_purchase_currency: true, in_landed_cost: true },
    });
    expect(parseForm(purchaseCostSchema, form({ purchase_id: PURCHASE_ID, kind: "import_tax", amount: "9", paid_in: "local" }))).toMatchObject({
      ok: true,
      data: { in_purchase_currency: false, in_landed_cost: false },
    });
    expect(parseForm(purchaseCostSchema, form({ purchase_id: PURCHASE_ID, kind: "bribe", amount: "-1", paid_in: "local" }))).toMatchObject({
      ok: false,
      errors: { kind: "Choose what the cost is for", amount: "Enter a number, for example 12.5" },
    });
  });
});

describe("database errors", () => {
  it("explain a supplier that still has purchases, and a purchase whose supplier was deleted", () => {
    expect(
      fromPgError({
        code: "23503",
        message: 'update or delete on table "suppliers" violates foreign key constraint "purchases_supplier_id_fkey" on table "purchases"',
      }),
    ).toEqual({ ok: false, errors: { form: SUPPLIER_HAS_PURCHASES_MESSAGE } });
    expect(
      fromPgError({ code: "23503", message: 'insert or update on table "purchases" violates foreign key constraint "purchases_supplier_id_fkey"' }),
    ).toEqual({ ok: false, errors: { supplier_id: SUPPLIER_GONE_MESSAGE } });
  });
});

describe("actions", () => {
  it.each([
    ["saveSupplier", () => saveSupplier(null, form({ name: "x" }))],
    ["deleteSupplier", () => deleteSupplier(SUPPLIER_ID)],
    ["savePurchase", () => savePurchase(null, form(purchaseForm))],
    ["deletePurchase", () => deletePurchase(PURCHASE_ID)],
    ["savePurchaseItem", () => savePurchaseItem(null, form({ purchase_id: PURCHASE_ID }))],
    ["savePurchaseCost", () => savePurchaseCost(null, form({ purchase_id: PURCHASE_ID }))],
    ["deletePurchaseItem", () => deletePurchaseItem(LINE_ID)],
    ["deletePurchaseCost", () => deletePurchaseCost(LINE_ID)],
  ] as const)("%s sends a visitor to the login page and touches nothing", async (_name, run) => {
    const { queries } = createFakeSupabase({});
    requireAdmin.mockImplementation(() => {
      throw new Error("REDIRECT /admin/login");
    });
    await expect(run()).rejects.toThrow("REDIRECT /admin/login");
    expect(queries).toEqual([]);
  });

  it("creating a supplier inserts it and opens its page", async () => {
    const { queries } = fakeSupabase(() => ({ data: { id: SUPPLIER_ID } }));
    await expect(saveSupplier(null, form({ name: "Taian Geo" }))).rejects.toThrow(`REDIRECT /admin/suppliers/${SUPPLIER_ID}`);
    expect(queries[0].table).toBe("suppliers");
    expect(queries[0].ops[0].args[0]).toMatchObject({ name: "Taian Geo", country: "China" });
  });

  it("deleting a supplier with purchases says why it cannot", async () => {
    fakeSupabase(() => ({
      error: { code: "23503", message: 'update or delete on table "suppliers" violates foreign key constraint "purchases_supplier_id_fkey"' },
    }));
    expect(await deleteSupplier(SUPPLIER_ID)).toEqual({ ok: false, errors: { form: SUPPLIER_HAS_PURCHASES_MESSAGE } });
  });

  it("creating a purchase inserts it and opens its page", async () => {
    const { queries } = fakeSupabase(() => ({ data: { id: PURCHASE_ID } }));
    await expect(savePurchase(null, form(purchaseForm))).rejects.toThrow(`REDIRECT /admin/purchases/${PURCHASE_ID}`);
    expect(queries[0].table).toBe("purchases");
    expect(queries[0].ops[0].args[0]).toMatchObject({ supplier_id: SUPPLIER_ID, exchange_rate: 83.5, destination: "IN" });
  });

  it("adds a product line to its purchase, and an edit never moves a line to another purchase", async () => {
    const line = { purchase_id: PURCHASE_ID, product_id: PRODUCT_ID, price_basis: "sqm", rolls: "10", sqm_per_roll: "350", unit_price: "0.5" };
    const { queries } = fakeSupabase();
    await expect(savePurchaseItem(null, form(line))).resolves.toEqual({ ok: true });
    expect(queries[0].table).toBe("purchase_items");
    expect(opNames(queries[0])).toEqual(["insert", "select"]);
    expect(queries[0].ops[0].args[0]).toMatchObject({ purchase_id: PURCHASE_ID, product_id: PRODUCT_ID, rolls: 10 });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/purchases/${PURCHASE_ID}`);

    await expect(savePurchaseItem(null, form({ ...line, id: LINE_ID }))).resolves.toEqual({ ok: true });
    expect(opNames(queries[1])).toEqual(["update", "eq", "eq", "select"]);
    expect(queries[1].ops[0].args[0]).not.toHaveProperty("purchase_id");
    expect(queries[1].ops.slice(1, 3).map((op) => op.args)).toEqual([
      ["id", LINE_ID],
      ["purchase_id", PURCHASE_ID],
    ]);
  });

  it("a line for a deleted product or purchase says what is gone", async () => {
    const line = { purchase_id: PURCHASE_ID, product_id: PRODUCT_ID, price_basis: "sqm", rolls: "1", sqm_per_roll: "1", unit_price: "1" };
    fakeSupabase(() => ({ error: { code: "23503", message: 'violates foreign key constraint "purchase_items_product_id_fkey"' } }));
    expect(await savePurchaseItem(null, form(line))).toMatchObject({ ok: false, errors: { product_id: expect.stringMatching(/no longer exists/) } });
    fakeSupabase(() => ({ error: { code: "23503", message: 'violates foreign key constraint "purchase_items_purchase_id_fkey"' } }));
    expect(await savePurchaseItem(null, form(line))).toMatchObject({ ok: false, errors: { form: expect.stringMatching(/no longer exists/) } });
  });

  it("adds a cost, and deleting a line refreshes its purchase", async () => {
    const { queries } = fakeSupabase();
    await expect(
      savePurchaseCost(null, form({ purchase_id: PURCHASE_ID, kind: "customs_duty", amount: "25000", paid_in: "local", in_landed_cost: "on" })),
    ).resolves.toEqual({ ok: true });
    expect(queries[0].table).toBe("purchase_costs");
    expect(queries[0].ops[0].args[0]).toMatchObject({ kind: "customs_duty", amount: 25000, in_purchase_currency: false, in_landed_cost: true });

    revalidatePath.mockReset();
    await expect(deletePurchaseCost(LINE_ID)).resolves.toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/purchases/${PURCHASE_ID}`);
  });

  it("a bad id is refused before the database is asked", async () => {
    const { queries } = fakeSupabase();
    expect(await deletePurchase("nope")).toMatchObject({ ok: false });
    expect(await deleteSupplier("nope")).toMatchObject({ ok: false });
    expect(await deletePurchaseItem("nope")).toMatchObject({ ok: false });
    expect(await savePurchase(null, form({ ...purchaseForm, id: "nope" }))).toMatchObject({ ok: false });
    expect(await savePurchaseCost(null, form({ id: "nope" }))).toMatchObject({ ok: false });
    expect(queries).toEqual([]);
  });
});

describe("purchase steps and the final price", () => {
  const items = [{ id: "a", rolls: 10, sqm_per_roll: "100", price_basis: "sqm", unit_price: "0.5" }];
  // 1,000 m² at $0.50 = $500; ₹10,000 of costs.
  const costs = [{ amount: "10000", in_purchase_currency: false, in_landed_cost: true }];

  it("uses the bank's rate once entered, else the expected rate", () => {
    const expected = { currency: "USD", exchange_rate: "84", destination: "IN" as const };
    expect(effectiveRate(expected)).toBe(84);
    expect(effectiveRate({ ...expected, bank_rate: "86.5" })).toBe(86.5);
    expect(effectiveRate({ ...expected, bank_rate: null })).toBe(84);
    // ₹42,000 + ₹10,000 over 1,000 m² = ₹52; at the bank's 86 it is ₹43,000 + ₹10,000 = ₹53.
    expect(purchaseSums(expected, items, costs).landedPerSqm).toBeCloseTo(52);
    expect(purchaseSums({ ...expected, bank_rate: 86 }, items, costs).landedPerSqm).toBeCloseTo(53);
  });

  it("shows a price in rupees, US dollars and dirhams when the rates are there", () => {
    const india = { currency: "USD", exchange_rate: "84", bank_rate: "85", destination: "IN" as const, inr_per_aed: "23" };
    expect(inCurrencies(46, india)).toEqual({ INR: 46, USD: 46 / 85, AED: 2 });
    expect(inCurrencies(46, { ...india, inr_per_aed: null })).toEqual({ INR: 46, USD: 46 / 85, AED: null });
    // Paid in yuan: dollars need their own rate.
    expect(inCurrencies(46, { ...india, currency: "CNY", bank_rate: "11.8" }).USD).toBeNull();
    expect(inCurrencies(46, { ...india, currency: "CNY", bank_rate: "11.8", usd_rate: "92" }).USD).toBeCloseTo(0.5);
    const uae = { currency: "USD", exchange_rate: "3.6725", destination: "AE" as const, inr_per_aed: "23" };
    expect(inCurrencies(10, uae)).toEqual({ INR: 230, USD: 10 / 3.6725, AED: 10 });
  });

  it("reads each step's own fields", () => {
    expect(parseForm(paymentStepSchema, form({ bank_rate: "86.25", inr_per_aed: "", payment_date: "2026-11-05" }))).toEqual({
      ok: true,
      data: { payment_date: "2026-11-05", bank_name: "", bank_rate: 86.25, usd_rate: null, inr_per_aed: null },
    });
    expect(parseForm(paymentStepSchema, form({ bank_rate: "0" }))).toMatchObject({ ok: false, errors: { bank_rate: "Enter the bank's rate above 0" } });
    expect(parseForm(deliveryStepSchema, form({ delivered_to: " Rakhial godown ", delivery_date: "" }))).toEqual({
      ok: true,
      data: { delivery_date: null, delivered_to: "Rakhial godown", transporter: "" },
    });
  });

  it("files a cost under its step, and only accepts that step's kinds", () => {
    expect(parseForm(purchaseCostSchema, form({ purchase_id: PURCHASE_ID, kind: "transport", amount: "5", paid_in: "local" }))).toMatchObject({
      ok: true,
      data: { stage: "delivery" },
    });
    expect(parseForm(purchaseCostSchema, form({ purchase_id: PURCHASE_ID, stage: "payment", kind: "bank_charges", amount: "5", paid_in: "local" }))).toMatchObject({
      ok: true,
      data: { stage: "payment", kind: "bank_charges" },
    });
    expect(parseForm(purchaseCostSchema, form({ purchase_id: PURCHASE_ID, stage: "delivery", kind: "customs_duty", amount: "5", paid_in: "local" }))).toMatchObject({
      ok: false,
      errors: { kind: "Choose a cost from the list" },
    });
    for (const step of PURCHASE_STEPS) {
      for (const kind of STEP_COST_KINDS[step]) {
        expect(COST_KIND_LABELS[kind]).toBeTruthy();
        // A kind's default step always offers it.
        expect(STEP_COST_KINDS[DEFAULT_COST_STEP[kind]]).toContain(kind);
      }
    }
  });

  it("saves only the posted step's columns", async () => {
    const { queries } = fakeSupabase(() => ({ data: [{ id: PURCHASE_ID }] }));
    expect(await savePurchase(null, form({ id: PURCHASE_ID, step: "payment", bank_rate: "86", supplier_id: "x" }))).toEqual({ ok: true });
    expect(queries[0].ops[0]).toEqual({
      name: "update",
      args: [{ payment_date: null, bank_name: "", bank_rate: 86, usd_rate: null, inr_per_aed: null }],
    });
    expect(await savePurchase(null, form({ id: PURCHASE_ID, step: "customs" }))).toMatchObject({ ok: false });
    // A new purchase starts from its quotation only.
    expect(await savePurchase(null, form({ step: "port" }))).toMatchObject({ ok: false });
    expect(queries).toHaveLength(1);
  });
});

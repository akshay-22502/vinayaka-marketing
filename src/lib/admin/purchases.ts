import { z } from "zod";
import type { Country } from "@/lib/content/types";
import { UUID_PATTERN, line, paragraphs } from "./schemas";

// Purchases from suppliers in the admin: statuses, the list's query parameters, the form schemas
// and the landed-cost sums. Plain module (no server or browser APIs), so pages, actions and unit
// tests share it.

export const PURCHASE_STATUSES = ["ordered", "shipped", "arrived", "cancelled"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  ordered: "Ordered",
  shipped: "Shipped",
  arrived: "Arrived",
  cancelled: "Cancelled",
};

export const PURCHASE_DESTINATIONS = ["IN", "AE"] as const satisfies readonly Country[];

/** The currencies a supplier is paid in. */
export const PURCHASE_CURRENCIES = ["USD", "CNY"] as const;
export type PurchaseCurrency = (typeof PURCHASE_CURRENCIES)[number];

export const PURCHASE_CURRENCY_LABELS: Record<PurchaseCurrency, string> = { USD: "US dollar (USD)", CNY: "Chinese yuan (CNY)" };

/** The currency costs and the landed cost are counted in: rupees for India, dirhams for the UAE. */
export function localCurrency(destination: Country): "INR" | "AED" {
  return destination === "AE" ? "AED" : "INR";
}

export const CONTAINER_TYPES = ["20ft", "40ft", "40ft_hc", "lcl"] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export const CONTAINER_TYPE_LABELS: Record<ContainerType, string> = {
  "20ft": "20 ft",
  "40ft": "40 ft",
  "40ft_hc": "40 ft high cube",
  lcl: "Part load (LCL)",
};

export const PRICE_BASES = ["sqm", "roll"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];

export const COST_KINDS = ["freight", "insurance", "customs_duty", "import_tax", "clearance", "port", "transport", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const COST_KIND_LABELS: Record<CostKind, string> = {
  freight: "Sea freight",
  insurance: "Insurance",
  customs_duty: "Customs duty",
  import_tax: "IGST / VAT on import",
  clearance: "Clearing agent",
  port: "Port and terminal charges",
  transport: "Transport to warehouse",
  other: "Other",
};

// List filters (?destination=, ?status=, ?supplier=, ?page=) -------------------------------

export type PurchaseFilters = {
  destination: Country | null;
  status: PurchaseStatus | null;
  /** A supplier id, or null for all suppliers. */
  supplier: string | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_PATTERN = /^\d{1,6}$/;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | null {
  return allowed.find((candidate) => candidate === value) ?? null;
}

/** The filters in the address of the list. Unknown or malformed values fall back to "no filter" and page 1. */
export function parsePurchaseFilters(params: SearchParams): PurchaseFilters {
  const rawPage = firstValue(params.page);
  const page = rawPage !== undefined && PAGE_PATTERN.test(rawPage) ? Number(rawPage) : 0;
  const supplier = firstValue(params.supplier);
  return {
    destination: oneOf(PURCHASE_DESTINATIONS, firstValue(params.destination)),
    status: oneOf(PURCHASE_STATUSES, firstValue(params.status)),
    supplier: supplier !== undefined && UUID_PATTERN.test(supplier) ? supplier.toLowerCase() : null,
    page: page >= 1 ? page : 1,
  };
}

/** The address of the list with these filters. Left-out filters and page 1 are not written. */
export function purchasesHref(filters: Partial<PurchaseFilters>): string {
  const query = new URLSearchParams();
  if (filters.destination) query.set("destination", filters.destination);
  if (filters.status) query.set("status", filters.status);
  if (filters.supplier) query.set("supplier", filters.supplier);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  const text = query.toString();
  return text ? `/admin/purchases?${text}` : "/admin/purchases";
}

// Form fields ------------------------------------------------------------------------------

const NUMBER_PATTERN = /^\d+(\.\d+)?$/;

/** A number typed in a form. Spaces and thousands commas are allowed ("1,25,000.50"). */
function decimal(required: string, options: { max: number; positive?: boolean }) {
  return z
    .string({ error: required })
    .transform((value) => value.replace(/[\s,]/g, ""))
    .refine((value) => value !== "", required)
    .refine((value) => value === "" || NUMBER_PATTERN.test(value), "Enter a number, for example 12.5")
    .transform(Number)
    .refine((value) => value < options.max, `Enter a number below ${options.max.toLocaleString("en-IN")}`)
    .refine((value) => !options.positive || value > 0, "Enter a number above 0");
}

function wholeNumber(required: string, options: { min: number; max: number }) {
  return z
    .string({ error: required })
    .transform((value) => value.replace(/[\s,]/g, ""))
    .refine((value) => value !== "", required)
    .refine((value) => value === "" || /^\d{1,9}$/.test(value), "Enter a whole number")
    .transform(Number)
    .refine((value) => value >= options.min && value <= options.max, `Enter a whole number from ${options.min} to ${options.max.toLocaleString("en-IN")}`);
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const optionalDate = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || isRealDate(value), "Enter a valid date")
  .transform((value) => (value === "" ? null : value));

const optionalContainer = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || (CONTAINER_TYPES as readonly string[]).includes(value), "Choose a container")
  .transform((value) => (value === "" ? null : (value as ContainerType)));

const id = (message: string) => z.string({ error: message }).trim().regex(UUID_PATTERN, message);

/** A checkbox: browsers post "on" when ticked and nothing when not. */
const checkbox = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true");

export const purchaseSchema = z.object({
  supplier_id: id("Choose a supplier"),
  reference: line("Order / invoice number", 200),
  destination: z.enum(PURCHASE_DESTINATIONS, { error: "Choose where the goods go" }),
  status: z.enum(PURCHASE_STATUSES, { error: "Choose a status" }),
  order_date: optionalDate,
  arrival_date: optionalDate,
  currency: z.enum(PURCHASE_CURRENCIES, { error: "Choose a currency" }),
  exchange_rate: decimal("Enter the exchange rate", { max: 100_000_000, positive: true }),
  container_type: optionalContainer,
  container_count: z
    .string()
    .default("")
    .transform((value) => (value.trim() === "" ? "1" : value))
    .pipe(wholeNumber("Enter the number of containers", { min: 0, max: 1000 })),
  container_numbers: line("Container numbers", 500),
  bl_number: line("Bill of lading number", 200),
  port_of_loading: line("Port of loading", 200),
  port_of_discharge: line("Port of arrival", 200),
  notes: paragraphs("Notes", 5000),
});

export const ITEM_NEEDS_PRODUCT_MESSAGE = "Choose a product or describe it";

export const purchaseItemSchema = z
  .object({
    purchase_id: id("This purchase could not be found. Reload the page."),
    product_id: z
      .string()
      .trim()
      .default("")
      .refine((value) => value === "" || UUID_PATTERN.test(value), "Choose a product from the list")
      .transform((value) => (value === "" ? null : value)),
    description: line("Description", 500),
    rolls: wholeNumber("Enter the number of rolls", { min: 1, max: 1_000_000 }),
    sqm_per_roll: decimal("Enter the square metres in one roll", { max: 1_000_000_000, positive: true }),
    price_basis: z.enum(PRICE_BASES, { error: "Choose per square metre or per roll" }),
    unit_price: decimal("Enter the price", { max: 10_000_000_000 }),
  })
  .superRefine((value, ctx) => {
    if (value.product_id === null && value.description === "") {
      ctx.addIssue({ code: "custom", path: ["product_id"], message: ITEM_NEEDS_PRODUCT_MESSAGE });
    }
  });

export const purchaseCostSchema = z
  .object({
    purchase_id: id("This purchase could not be found. Reload the page."),
    kind: z.enum(COST_KINDS, { error: "Choose what the cost is for" }),
    description: line("Description", 300),
    amount: decimal("Enter the amount", { max: 1_000_000_000_000 }),
    /** "purchase" (the supplier's currency) or "local" (INR or AED). */
    paid_in: z.enum(["purchase", "local"], { error: "Choose the currency" }),
    in_landed_cost: checkbox,
  })
  .transform(({ paid_in, ...value }) => ({ ...value, in_purchase_currency: paid_in === "purchase" }));

// Landed cost ------------------------------------------------------------------------------

export type PurchaseForSums = { currency: string; exchange_rate: number | string; destination: Country };
export type ItemForSums = { id: string; rolls: number | string; sqm_per_roll: number | string; price_basis: string; unit_price: number | string };
export type CostForSums = { amount: number | string; in_purchase_currency: boolean; in_landed_cost: boolean };

export type LineSums = {
  id: string;
  rolls: number;
  /** Square metres on the line. */
  area: number;
  /** The supplier's price for one square metre and for one roll, in the purchase currency. */
  pricePerSqm: number;
  pricePerRoll: number;
  /** The goods, in the purchase currency and in the local currency. */
  goods: number;
  goodsLocal: number;
  /** This line's part of the costs, in the local currency. */
  costShare: number;
  /** Goods plus costs, in the local currency: in total, per roll and per square metre. */
  landed: number;
  landedPerRoll: number;
  landedPerSqm: number;
};

export type PurchaseSums = {
  lines: LineSums[];
  rolls: number;
  area: number;
  goods: number;
  goodsLocal: number;
  /** Costs counted in the landed cost, and costs kept out of it (tax claimed back), in the local currency. */
  costs: number;
  excludedCosts: number;
  landed: number;
  /** Landed cost per square metre over the whole purchase, or null when it has no products. */
  landedPerSqm: number | null;
};

const num = (value: number | string) => Number(value) || 0;

/**
 * The landed cost of a purchase. Supplier prices and costs paid in the supplier's currency are
 * turned into the local currency at the purchase's exchange rate. The costs counted in the landed
 * cost are shared between the products in proportion to their value (as customs duty is charged),
 * or by area when every product is free of charge.
 */
export function purchaseSums(purchase: PurchaseForSums, items: ItemForSums[], costs: CostForSums[]): PurchaseSums {
  const rate = num(purchase.exchange_rate);
  const toLocal = (amount: number, inPurchaseCurrency: boolean) => (inPurchaseCurrency ? amount * rate : amount);

  let counted = 0;
  let excluded = 0;
  for (const cost of costs) {
    const local = toLocal(num(cost.amount), cost.in_purchase_currency);
    if (cost.in_landed_cost) counted += local;
    else excluded += local;
  }

  const base = items.map((item) => {
    const rolls = num(item.rolls);
    const sqmPerRoll = num(item.sqm_per_roll);
    const unitPrice = num(item.unit_price);
    const perSqm = item.price_basis === "roll" ? (sqmPerRoll > 0 ? unitPrice / sqmPerRoll : 0) : unitPrice;
    const perRoll = item.price_basis === "roll" ? unitPrice : unitPrice * sqmPerRoll;
    const goods = perRoll * rolls;
    return { id: item.id, rolls, area: rolls * sqmPerRoll, pricePerSqm: perSqm, pricePerRoll: perRoll, goods, goodsLocal: goods * rate };
  });

  const goodsLocal = base.reduce((sum, line) => sum + line.goodsLocal, 0);
  const area = base.reduce((sum, line) => sum + line.area, 0);
  const weight = (line: (typeof base)[number]) =>
    goodsLocal > 0 ? line.goodsLocal / goodsLocal : area > 0 ? line.area / area : 0;

  const lines: LineSums[] = base.map((line) => {
    const costShare = counted * weight(line);
    const landed = line.goodsLocal + costShare;
    return {
      ...line,
      costShare,
      landed,
      landedPerRoll: line.rolls > 0 ? landed / line.rolls : 0,
      landedPerSqm: line.area > 0 ? landed / line.area : 0,
    };
  });

  // With no products the costs have nowhere to go, but they are still part of what was spent.
  const landed = lines.length > 0 ? lines.reduce((sum, line) => sum + line.landed, 0) : counted;
  return {
    lines,
    rolls: base.reduce((sum, line) => sum + line.rolls, 0),
    area,
    goods: base.reduce((sum, line) => sum + line.goods, 0),
    goodsLocal,
    costs: counted,
    excludedCosts: excluded,
    landed,
    landedPerSqm: area > 0 && lines.length > 0 ? landed / area : null,
  };
}

/** An amount with its currency, Indian digit grouping: "₹1,25,000.00", "US$12.50", "AED 3,400.00". */
export function formatMoney(amount: number, currency: string, fractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Math.min(2, fractionDigits),
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** A quantity with Indian digit grouping and up to `fractionDigits` decimals: "12,500", "1,250.5". */
export function formatQuantity(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: fractionDigits }).format(value);
}

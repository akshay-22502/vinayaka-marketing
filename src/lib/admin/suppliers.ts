import { z } from "zod";
import { line, paragraphs } from "./schemas";

// The suppliers list in the admin: the manufacturers we buy from. Plain module (no server or
// browser APIs), so pages, actions and unit tests share it.

/** The longest search text; anything after it is ignored. */
const SEARCH_MAX = 100;
const PAGE_PATTERN = /^\d{1,6}$/;

export type SupplierFilters = {
  /** Part of a supplier name, or "" for no search. */
  q: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The filters in the address of the list. Malformed values fall back to no search and page 1. */
export function parseSupplierFilters(params: SearchParams): SupplierFilters {
  const rawPage = firstValue(params.page);
  const page = rawPage !== undefined && PAGE_PATTERN.test(rawPage) ? Number(rawPage) : 0;
  return { q: (firstValue(params.q) ?? "").trim().slice(0, SEARCH_MAX), page: page >= 1 ? page : 1 };
}

/** The address of the list with these filters. A blank search and page 1 are not written. */
export function suppliersHref(filters: Partial<SupplierFilters>): string {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  const text = query.toString();
  return text ? `/admin/suppliers?${text}` : "/admin/suppliers";
}

export const supplierSchema = z.object({
  name: z.string({ error: "Enter the company name" }).trim().min(1, "Enter the company name").max(200, "Company must be 200 characters or fewer"),
  country: z.string().trim().max(100, "Country must be 100 characters or fewer").default("").transform((value) => value || "China"),
  location: line("City / province", 200),
  contact_person: line("Contact person", 200),
  phone: line("Phone", 100),
  mobile: line("Mobile / WhatsApp / WeChat", 100),
  email: line("Email", 200),
  website: line("Website", 300),
  makes: paragraphs("What they make", 1000),
  payment_terms: line("Payment terms", 300),
  notes: paragraphs("Notes", 5000),
});

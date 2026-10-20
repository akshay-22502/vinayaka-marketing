import type { Country } from "@/lib/content/types";

// The query parameters of /admin/quotes: ?status=, ?country= and ?page=. Plain module (no server or
// browser APIs), so the page and the unit tests share it. Values it does not know are ignored and the
// list shows everything: an old bookmark or a hand-typed address must never be an error.

/** The statuses of a quote request, in the order a request moves through them. */
export const QUOTE_STATUSES = ["new", "contacted", "quoted", "closed"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_COUNTRIES = ["IN", "AE"] as const satisfies readonly Country[];

/** How many requests one page of the inbox lists. */
export const QUOTES_PER_PAGE = 50;

/** The most pages a `?page=` can name (6 digits); anything longer is not a page number. */
const PAGE_PATTERN = /^\d{1,6}$/;

export type QuoteFilters = {
  status: QuoteStatus | null;
  country: Country | null;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

/** The first value of a parameter; a repeated parameter (`?status=a&status=b`) counts as its first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | null {
  // A search through a list compares values only, so "__proto__" and "constructor" are never found (a plain object would).
  return allowed.find((candidate) => candidate === value) ?? null;
}

/** The filters in the address of the inbox. Unknown or malformed values fall back to "no filter" and page 1. */
export function parseQuoteFilters(params: SearchParams): QuoteFilters {
  const rawPage = firstValue(params.page);
  const page = rawPage !== undefined && PAGE_PATTERN.test(rawPage) ? Number(rawPage) : 0;
  return {
    status: oneOf(QUOTE_STATUSES, firstValue(params.status)),
    country: oneOf(QUOTE_COUNTRIES, firstValue(params.country)),
    page: page >= 1 ? page : 1,
  };
}

/** The address of the inbox with these filters. Left-out filters and page 1 are not written. */
export function quotesHref(filters: { status?: QuoteStatus | null; country?: Country | null; page?: number }): string {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.country) query.set("country", filters.country);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  const text = query.toString();
  return text ? `/admin/quotes?${text}` : "/admin/quotes";
}

/** How many pages `total` requests make; an empty list still has one (empty) page. */
export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / QUOTES_PER_PAGE));
}

/** Keeps a page number inside the list: a page past the end shows the last page. */
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(1, page), pageCount(total));
}

/** The inclusive row range of a page, as Supabase's `.range(from, to)` takes it. */
export function rangeForPage(page: number): { from: number; to: number } {
  const from = (page - 1) * QUOTES_PER_PAGE;
  return { from, to: from + QUOTES_PER_PAGE - 1 };
}

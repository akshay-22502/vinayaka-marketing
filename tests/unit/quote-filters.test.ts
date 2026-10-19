import { describe, expect, it } from "vitest";
import {
  QUOTES_PER_PAGE,
  QUOTE_COUNTRIES,
  QUOTE_STATUSES,
  clampPage,
  pageCount,
  parseQuoteFilters,
  quotesHref,
  rangeForPage,
} from "@/lib/admin/quote-filters";

// The query parameters of /admin/quotes (?status=, ?country=, ?page=). Unknown values are
// ignored (the list shows everything), never an error.

describe("the allowed values", () => {
  it("are exactly the database's statuses and countries", () => {
    expect([...QUOTE_STATUSES]).toEqual(["new", "contacted", "quoted", "closed"]);
    expect([...QUOTE_COUNTRIES]).toEqual(["IN", "AE"]);
  });
});

describe("parseQuoteFilters", () => {
  it("reads a status, a country and a page", () => {
    expect(parseQuoteFilters({ status: "quoted", country: "AE", page: "3" })).toEqual({
      status: "quoted",
      country: "AE",
      page: 3,
    });
  });

  it("shows everything, on page 1, when there are no parameters", () => {
    expect(parseQuoteFilters({})).toEqual({ status: null, country: null, page: 1 });
  });

  it("ignores values that are not known statuses or countries", () => {
    for (const bad of ["", "bogus", "NEW", "New", " new", "new ", "won", "'; drop table quote_requests; --", "__proto__", "constructor"]) {
      expect(parseQuoteFilters({ status: bad }).status, JSON.stringify(bad)).toBeNull();
    }
    for (const bad of ["", "US", "in", "ae", "India", "IN ", "IN,AE", "*"]) {
      expect(parseQuoteFilters({ country: bad }).country, JSON.stringify(bad)).toBeNull();
    }
  });

  it("uses the first value when a parameter is repeated, and ignores it when that one is unknown", () => {
    expect(parseQuoteFilters({ status: ["closed", "new"] }).status).toBe("closed");
    expect(parseQuoteFilters({ status: ["bogus", "new"] }).status).toBeNull();
    expect(parseQuoteFilters({ country: ["AE", "IN"] }).country).toBe("AE");
    expect(parseQuoteFilters({ status: [] }).status).toBeNull();
  });

  it("falls back to page 1 for anything that is not a positive whole number", () => {
    for (const bad of ["", "0", "-1", "2.5", "abc", "1e3", "0x10", " 2", "99999999", "NaN", "Infinity"]) {
      expect(parseQuoteFilters({ page: bad }).page, JSON.stringify(bad)).toBe(1);
    }
    expect(parseQuoteFilters({ page: "007" }).page).toBe(7);
    expect(parseQuoteFilters({ page: ["4", "9"] }).page).toBe(4);
    expect(parseQuoteFilters({ page: undefined }).page).toBe(1);
  });
});

describe("quotesHref", () => {
  it("is the plain list when nothing is chosen", () => {
    expect(quotesHref({})).toBe("/admin/quotes");
    expect(quotesHref({ status: null, country: null, page: 1 })).toBe("/admin/quotes");
  });

  it("carries the chosen filters, and the page only after the first", () => {
    expect(quotesHref({ status: "new" })).toBe("/admin/quotes?status=new");
    expect(quotesHref({ country: "IN" })).toBe("/admin/quotes?country=IN");
    expect(quotesHref({ status: "closed", country: "AE", page: 2 })).toBe("/admin/quotes?status=closed&country=AE&page=2");
    expect(quotesHref({ page: 4 })).toBe("/admin/quotes?page=4");
  });

  it("round-trips through parseQuoteFilters", () => {
    const filters = { status: "contacted", country: "IN", page: 5 } as const;
    const query = Object.fromEntries(new URL(quotesHref(filters), "http://x").searchParams);
    expect(parseQuoteFilters(query)).toEqual(filters);
  });
});

describe("paging", () => {
  it("shows 50 requests a page", () => {
    expect(QUOTES_PER_PAGE).toBe(50);
  });

  it("counts pages, with at least one even when the list is empty", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
    expect(pageCount(150)).toBe(3);
  });

  it("keeps a page that is out of range inside the list", () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(999, 0)).toBe(1);
    expect(clampPage(999, 51)).toBe(2);
    expect(clampPage(2, 51)).toBe(2);
    expect(clampPage(1, 51)).toBe(1);
  });

  it("gives the inclusive row range of a page", () => {
    expect(rangeForPage(1)).toEqual({ from: 0, to: 49 });
    expect(rangeForPage(2)).toEqual({ from: 50, to: 99 });
  });
});

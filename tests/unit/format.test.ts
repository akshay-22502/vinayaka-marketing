import { describe, expect, it } from "vitest";
import { countryName, formatDate, placeLabel } from "@/lib/format";

describe("formatDate", () => {
  it("writes a stored date (YYYY-MM-DD) as day, month name and year", () => {
    expect(formatDate("2027-12-31")).toBe("31 December 2027");
    expect(formatDate("2026-01-05")).toBe("5 January 2026");
  });

  it("does not shift the day with the server's time zone", () => {
    expect(formatDate("2026-03-01")).toBe("1 March 2026");
  });

  it("returns the text unchanged when it is not a date", () => {
    expect(formatDate("not a date")).toBe("not a date");
    expect(formatDate("")).toBe("");
  });
});

describe("countryName", () => {
  it("names the two countries the site serves", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("AE")).toBe("UAE");
  });
});

describe("placeLabel", () => {
  it("joins the location and the country", () => {
    expect(placeLabel("Pune", "IN")).toBe("Pune, India");
    expect(placeLabel(" Dubai ", "AE")).toBe("Dubai, UAE");
  });

  it("is just the country when the location is blank", () => {
    expect(placeLabel("", "AE")).toBe("UAE");
    expect(placeLabel("   ", "IN")).toBe("India");
  });
});

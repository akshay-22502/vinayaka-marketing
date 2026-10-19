import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDateTimeUtc } from "@/lib/format";
import {
  QUOTE_STATUS_LABELS,
  attachmentLabel,
  isMissingFileError,
  productLabels,
  safeMailto,
} from "@/lib/admin/quote-view";
import { QUOTE_STATUSES } from "@/lib/admin/quote-filters";

// Small pure helpers behind the quote screens.

describe("formatDateTimeUtc", () => {
  it("writes a timestamp as day, month name, year and the UTC time", () => {
    expect(formatDateTimeUtc("2026-10-19T14:05:09.123+00:00")).toBe("19 October 2026, 14:05 UTC");
    expect(formatDateTimeUtc("2026-01-05T00:00:00Z")).toBe("5 January 2026, 00:00 UTC");
  });

  it("converts an offset to UTC", () => {
    expect(formatDateTimeUtc("2026-10-19T23:30:00-02:00")).toBe("20 October 2026, 01:30 UTC");
  });

  it("returns text that is not a timestamp unchanged", () => {
    expect(formatDateTimeUtc("yesterday")).toBe("yesterday");
    expect(formatDateTimeUtc("")).toBe("");
  });
});

describe("QUOTE_STATUS_LABELS", () => {
  it("names every status", () => {
    expect(QUOTE_STATUSES.map((status) => QUOTE_STATUS_LABELS[status])).toEqual(["New", "Contacted", "Quoted", "Closed"]);
  });
});

describe("safeMailto", () => {
  it("links an ordinary address", () => {
    expect(safeMailto("asha@verma-infra.example")).toBe("mailto:asha@verma-infra.example");
    expect(safeMailto("  a.b+tag@sub.example.co.in ")).toBe("mailto:a.b+tag@sub.example.co.in");
    expect(safeMailto("o'brien@example.com")).toBe("mailto:o'brien@example.com");
  });

  it("does not link anything that could add a header, a recipient or a query to the link", () => {
    for (const email of [
      "a@example.com?subject=hi",
      "a@example.com&cc=b@example.com",
      "a@example.com,b@example.com",
      "a@example.com;b@example.com",
      "a@example.com\r\nBcc: x@example.com",
      "a b@example.com",
      "<a@example.com>",
      "a@example.com%0aBcc:x",
      "javascript:alert(1)//@x.example",
      "a@b",
      "",
      "[India email]",
    ]) {
      expect(safeMailto(email), JSON.stringify(email)).toBeNull();
    }
  });
});

describe("attachmentLabel", () => {
  it("shows the file name the buyer sent, without the folder and the random id", () => {
    expect(attachmentLabel("2026-10/0b5f2c1e-8d7a-4c3b-9e21-5a6f7d8c9b10-canal-plan.pdf")).toBe("canal-plan.pdf");
    expect(attachmentLabel("plain.png")).toBe("plain.png");
  });
});

describe("isMissingFileError", () => {
  it("recognises the storage answer for a file that is not there", () => {
    expect(isMissingFileError({ message: "Object not found", statusCode: "404" })).toBe(true);
    expect(isMissingFileError({ message: "Object not found" })).toBe(true);
    expect(isMissingFileError({ message: "x", statusCode: 404 })).toBe(true);
  });

  it("does not take an outage or a permission problem for a missing file", () => {
    expect(isMissingFileError({ message: "fetch failed" })).toBe(false);
    expect(isMissingFileError({ message: "new row violates row-level security policy", statusCode: "403" })).toBe(false);
    expect(isMissingFileError(null)).toBe(false);
  });
});

describe("productLabels", () => {
  it("uses the product names, and the slug for a product that no longer exists", () => {
    const names = new Map([["pp-biaxial-geogrid", "PP Biaxial Geogrid"]]);
    expect(productLabels(["pp-biaxial-geogrid", "gone-product"], names)).toEqual(["PP Biaxial Geogrid", "gone-product"]);
    expect(productLabels([], names)).toEqual([]);
  });
});

describe("the quote screens render buyer text as plain text", () => {
  // Buyer-supplied text (name, company, message, ...) must only ever go through React's escaping:
  // no raw HTML injection, no Markdown renderer, in anything that shows a quote request.
  const root = path.resolve(__dirname, "../..");
  const quoteDir = path.join(root, "src/app/admin/(protected)/quotes");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? sourceFiles(full) : [full];
    });
  }

  const files = [
    ...sourceFiles(quoteDir),
    path.join(root, "src/components/admin/QuoteBadges.tsx"),
    path.join(root, "src/components/admin/QuoteReviewForm.tsx"),
  ];

  it("finds the files to check", () => {
    expect(files.map((file) => path.basename(file))).toEqual(
      expect.arrayContaining(["page.tsx", "actions.ts", "QuoteBadges.tsx", "QuoteReviewForm.tsx"]),
    );
  });

  it.each(files.map((file) => [path.relative(root, file), file]))("%s has no raw HTML or Markdown rendering", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    expect(source).not.toMatch(/innerHTML/);
    expect(source).not.toMatch(/react-markdown|components\/site\/Markdown|rehype/);
  });
});

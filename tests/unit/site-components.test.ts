import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/site/Markdown";
import { OfficeDetails } from "@/components/site/OfficeDetails";
import { SpecTable } from "@/components/site/SpecTable";
import type { SpecGrid } from "@/lib/content/types";

describe("SpecTable", () => {
  const grid: SpecGrid = {
    models: ["BX1515", "BX2020"],
    rows: [
      { name: "Tensile strength", unit: "kN/m", testMethod: "ASTM D6637", values: ["15", null] },
      { name: "Aperture size", unit: null, testMethod: null, values: ["40", "40"] },
    ],
  };
  const html = renderToStaticMarkup(createElement(SpecTable, { grid, caption: "Test specs" }));

  it("has Property, Unit, Test method and one column per model", () => {
    for (const heading of ["Property", "Unit", "Test method", "BX1515", "BX2020"]) {
      expect(html).toContain(`>${heading}</th>`);
    }
  });

  it("shows a dash in every empty cell, including a missing unit or test method", () => {
    expect(html.match(/<td aria-label="No value"[^>]*>–<\/td>/g)).toHaveLength(3);
  });

  it("renders nothing for a product without spec rows", () => {
    expect(renderToStaticMarkup(createElement(SpecTable, { grid: { models: ["A"], rows: [] }, caption: "x" }))).toBe("");
  });
});

describe("Markdown", () => {
  it("does not render raw HTML from the text", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, null, "Hello <script>alert(1)</script> <img src=x onerror=alert(1)>"),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("drops javascript: links and demotes headings below the page heading", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, null, "# Title\n\n[x](javascript:alert(1))"),
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h1");
  });
});

describe("OfficeDetails", () => {
  it("renders placeholder contact values as plain text and real ones as links", () => {
    const placeholders = renderToStaticMarkup(
      createElement(OfficeDetails, {
        title: "India office",
        address: "[India address]",
        phone: "[India phone]",
        whatsapp: "[India WhatsApp]",
        email: "[India email]",
      }),
    );
    expect(placeholders).toContain("[India phone]");
    expect(placeholders).not.toMatch(/href="(tel:|mailto:|https:\/\/wa\.me)/);

    const real = renderToStaticMarkup(
      createElement(OfficeDetails, {
        title: "India office",
        address: "1 Main Road",
        phone: "+91 98765 43210",
        whatsapp: "+91 98765 43210",
        email: "sales@terratechbharat.com",
      }),
    );
    expect(real).toContain('href="tel:+919876543210"');
    expect(real).toContain('href="https://wa.me/919876543210"');
    expect(real).toContain('href="mailto:sales@terratechbharat.com"');
  });
});

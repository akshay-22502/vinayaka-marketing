import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteForm } from "@/components/site/QuoteForm";

const options = [
  { slug: "pp-biaxial-geogrid", name: "PP Biaxial Geogrid" },
  { slug: "hdpe-geomembrane", name: "HDPE Geomembrane" },
];

function render(props: { preselected?: string[]; siteKey?: string; options?: typeof options } = {}): string {
  return renderToStaticMarkup(
    createElement(QuoteForm, {
      options: props.options ?? options,
      preselected: props.preselected ?? [],
      siteKey: props.siteKey,
    }),
  );
}

/** The `<input ...>` tag for a product checkbox. */
function checkbox(html: string, slug: string): string {
  const tag = new RegExp(`<input[^>]*name="products"[^>]*value="${slug}"[^>]*>`).exec(html)?.[0];
  if (!tag) throw new Error(`no checkbox for ${slug}`);
  return tag;
}

describe("QuoteForm", () => {
  it("posts as a multipart form to the quote API even before scripts run, and checks fields itself", () => {
    // Lower-cased: React DOM writes attribute names in one case or the other depending on the build.
    const html = render().toLowerCase();
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/quote"');
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain("novalidate");
    expect(html).toContain('aria-label="quote request"');
  });

  it("uses the field names the quote API reads", () => {
    const html = render();
    for (const name of ["name", "company", "email", "phone", "country", "products", "quantity", "projectLocation", "message", "attachment"]) {
      expect(html, name).toContain(`name="${name}"`);
    }
  });

  it("ticks only the pre-selected products that are on offer", () => {
    const html = render({ preselected: ["hdpe-geomembrane", "not-a-product"] });
    expect(checkbox(html, "hdpe-geomembrane")).toContain("checked");
    expect(checkbox(html, "pp-biaxial-geogrid")).not.toContain("checked");
    expect(html).not.toContain("not-a-product");
  });

  it("leaves out the product list when there are no products", () => {
    const html = render({ options: [] });
    expect(html).not.toContain('name="products"');
  });

  it("offers India and UAE as the only countries", () => {
    const html = render();
    expect(html.match(/<input[^>]*name="country"[^>]*>/g)?.map((tag) => /value="(\w+)"/.exec(tag)?.[1])).toEqual(["IN", "AE"]);
  });

  it("limits the file input to the allowed types", () => {
    expect(render()).toContain('accept=".pdf,.jpg,.jpeg,.png,.dwg"');
  });

  it("renders no captcha without a site key", () => {
    const html = render();
    expect(html).not.toContain("turnstile");
    expect(html).not.toContain("challenges.cloudflare.com");
  });

  it("renders the captcha container when there is a site key", () => {
    expect(render({ siteKey: "0x4AAAAAAA-site-key" })).toContain('data-testid="turnstile"');
  });

  it("starts with an empty alert region and an enabled send button", () => {
    const html = render();
    expect(html).toMatch(/<div role="alert"[^>]*><\/div>/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Send request<\/button>/);
    expect(html).not.toMatch(/<button[^>]*\sdisabled[=\s>]/);
  });
});

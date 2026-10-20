import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// SEO against the seed: every seed product is published, and there are no
// certifications or projects (so those sections are hidden). NEXT_PUBLIC_SITE_URL
// is http://localhost:3100 for the E2E build (scripts/e2e-prepare.ts).

const SITE = "http://localhost:3100";
const SITE_NAME = "TerraTechBharat";
const HOME_TITLE = "TerraTechBharat | Geosynthetic solutions for India and the UAE";
const PRODUCT_PATH = "/products/geogrid/pp-biaxial-geogrid";
const DEFAULT_IMAGE = `${SITE}/brand/og-default.png`;

/** Absolute URL of a path; the home page is the bare site URL, without a trailing slash. */
const urlOf = (path: string) => (path === "/" ? SITE : `${SITE}${path}`);

/** Public pages that exist for the seed (certifications and projects are hidden while empty). */
const PAGES = [
  "/",
  "/products",
  "/products/geogrid",
  PRODUCT_PATH,
  "/applications",
  "/applications/roads-and-pavements",
  "/about",
  "/contact",
  "/quote",
];

async function metaContent(page: Page, selector: string): Promise<string | null> {
  const meta = page.locator(selector);
  return (await meta.count()) > 0 ? meta.first().getAttribute("content") : null;
}

/** Every JSON-LD block on the page, parsed. */
async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.map((block) => JSON.parse(block) as Record<string, unknown>);
}

async function fetchText(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path);
  expect(response.status(), `GET ${path}`).toBe(200);
  return response.text();
}

test.describe("sitemap.xml", () => {
  test("lists published pages as absolute URLs, and leaves out hidden sections", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();

    for (const path of PAGES) {
      expect(xml, path).toContain(`<loc>${urlOf(path)}</loc>`);
    }
    expect(xml).toContain("<lastmod>");

    // Seed has no certifications or projects, so those sections are hidden and unlisted.
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs.length).toBeGreaterThan(10);
    for (const loc of locs) {
      expect(loc.startsWith(SITE), `${loc} is absolute`).toBe(true);
      const path = loc.slice(SITE.length);
      expect(path, loc).not.toMatch(/^\/(certifications|projects|admin|api)(\/|$)/);
    }
    expect(xml).not.toContain("/certifications");
  });
});

test.describe("robots.txt", () => {
  test("allows the site, blocks admin and api, and points at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();

    expect(text).toMatch(/^User-Agent: \*$/im);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).toMatch(/^Disallow: \/admin$/m);
    expect(text).toMatch(/^Disallow: \/api$/m);
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});

test.describe("brand icons", () => {
  test("the head links the brand icons, and each one is served (not the create-next-app default)", async ({ page, request }) => {
    await page.goto("/");

    const svgHref = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
    expect(svgHref, "svg icon link").toBeTruthy();
    const svg = await request.get(svgHref!);
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    const markup = await svg.text();
    expect(markup).toContain("#253F70"); // navy
    expect(markup).toContain("#D97A3A"); // orange

    const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(appleHref, "apple touch icon link").toBeTruthy();
    const apple = await request.get(appleHref!);
    expect(apple.status()).toBe(200);
    expect(apple.headers()["content-type"]).toContain("image/png");

    // Crawlers and old browsers ask for /favicon.ico directly.
    const ico = await request.get("/favicon.ico");
    expect(ico.status()).toBe(200);
    expect(ico.headers()["content-type"]).toMatch(/icon/);
  });
});

test.describe("page metadata", () => {
  test("every public page has its own title, description, canonical URL and Open Graph tags", async ({ page }) => {
    const titles = new Set<string>();

    for (const path of PAGES) {
      await page.goto(path);
      const url = urlOf(path);

      const title = await page.title();
      expect(title.length, `${path} title`).toBeGreaterThan(0);
      if (path !== "/") expect(title, `${path} title`).toMatch(/ \| TerraTechBharat$/);
      titles.add(title);

      const description = await metaContent(page, 'meta[name="description"]');
      expect(description?.trim().length ?? 0, `${path} description`).toBeGreaterThan(20);

      // Canonical is the absolute URL of the page itself.
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical, `${path} canonical`).toBe(url);

      expect(await metaContent(page, 'meta[property="og:title"]'), `${path} og:title`).toBeTruthy();
      expect(await metaContent(page, 'meta[property="og:description"]'), `${path} og:description`).toBeTruthy();
      expect(await metaContent(page, 'meta[property="og:site_name"]'), `${path} og:site_name`).toBe(SITE_NAME);
      expect(await metaContent(page, 'meta[property="og:type"]'), `${path} og:type`).toBe("website");
      expect(await metaContent(page, 'meta[property="og:url"]'), `${path} og:url`).toBe(canonical);
      expect(await metaContent(page, 'meta[name="twitter:card"]'), `${path} twitter:card`).toBe(
        "summary_large_image",
      );

      // Always an absolute URL: the page's own photo when it has one, else the shared default image.
      const image = await metaContent(page, 'meta[property="og:image"]');
      expect(image, `${path} og:image`).toMatch(/^https?:\/\/[^/]+\/.+/);
      // Pages that never have a photo of their own use the default.
      if (["/", "/about", "/contact", "/products", "/applications", "/quote"].includes(path)) {
        expect(image, `${path} og:image`).toBe(DEFAULT_IMAGE);
      }
    }

    expect(titles.size, "titles are unique per page").toBe(PAGES.length);
  });

  test("the home page title is the brand and tagline", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(HOME_TITLE);
    expect(await metaContent(page, 'meta[property="og:title"]')).toBe(HOME_TITLE);
  });

  test("the default Open Graph image is served as a 1200x630 PNG", async ({ page, request }) => {
    const response = await request.get("/brand/og-default.png");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");

    // PNG header: 8 signature bytes, then the IHDR chunk, whose first two fields are width and height.
    const bytes = await response.body();
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);

    await page.goto("/about");
    expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe("1200");
    expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe("630");
  });

  test("a product page is titled with the product and described by its summary", async ({ page }) => {
    await page.goto(PRODUCT_PATH);

    await expect(page).toHaveTitle("PP Biaxial Geogrid | TerraTechBharat");
    expect(await metaContent(page, 'meta[property="og:title"]')).toBe("PP Biaxial Geogrid");

    const summary = (await page.getByRole("main").locator("h1 + p").textContent())?.trim();
    expect(summary).toBeTruthy();
    // Descriptions are trimmed to a search-friendly length, ending in an ellipsis when cut.
    const description = await metaContent(page, 'meta[name="description"]');
    expect(description).toBe(await metaContent(page, 'meta[property="og:description"]'));
    expect(description!.length).toBeLessThanOrEqual(160);
    expect(summary!.startsWith(description!.replace(/…$/, "").trim())).toBe(true);
  });
});

test.describe("structured data", () => {
  test("a product page has Product JSON-LD without offers", async ({ page, request }) => {
    await page.goto(PRODUCT_PATH);
    const blocks = await jsonLd(page);
    const product = blocks.find((block) => block["@type"] === "Product");
    expect(product, "a Product block").toBeDefined();

    expect(product).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "PP Biaxial Geogrid",
      brand: { "@type": "Brand", name: "TerraTechBharat" },
      category: "Geogrid",
      url: `${SITE}${PRODUCT_PATH}`,
    });
    expect(String(product!.description).length).toBeGreaterThan(20);
    // No prices anywhere: no offers (and so no price).
    expect(product).not.toHaveProperty("offers");
    // Seed products have no photos; when there is one it must be an absolute URL.
    if ("image" in product!) expect(String(product!.image)).toMatch(/^https?:\/\//);

    // Same check on the raw HTML: nothing price-like is emitted by any means.
    const html = await fetchText(request, PRODUCT_PATH);
    expect(html).not.toContain('"offers"');
    expect(html).not.toMatch(/"price"/);
  });

  test("the home page describes the organisation", async ({ page }) => {
    await page.goto("/");
    const organisation = (await jsonLd(page)).find((block) => block["@type"] === "Organization");
    expect(organisation).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "TerraTechBharat",
      url: SITE,
      logo: `${SITE}/brand/logo.png`,
    });
  });

  test("admin-entered text cannot break out of the JSON-LD script", async ({ page }) => {
    // A product published after the build renders on first visit (dynamicParams), so a
    // fresh row exercises the real pipeline. The row is removed afterwards.
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const slug = "seo-injection-check";
    const name = "Grid </script><script>window.__injected = true</script> & more";
    const category = await service.from("categories").select("id").eq("slug", "geogrid").single();
    expect(category.error).toBeNull();
    const inserted = await service.from("products").insert({
      slug,
      category_id: category.data!.id,
      name,
      summary: name,
      overview: "Injection check.",
      published: true,
    });
    expect(inserted.error).toBeNull();

    try {
      const response = await page.goto(`/products/geogrid/${slug}`);
      expect(response?.status()).toBe(200);

      // The script never ran, and the data block still parses back to the original text.
      expect(await page.evaluate(() => (window as unknown as { __injected?: boolean }).__injected)).toBeUndefined();
      const product = (await jsonLd(page)).find((block) => block["@type"] === "Product");
      expect(product).toMatchObject({ name, description: name });
      expect(await page.locator('script[type="application/ld+json"]').count()).toBe(1);
    } finally {
      await service.from("products").delete().eq("slug", slug);
    }
  });

  test("other pages carry no Product JSON-LD", async ({ page }) => {
    await page.goto("/products/geogrid");
    const blocks = await jsonLd(page);
    expect(blocks.filter((block) => block["@type"] === "Product")).toHaveLength(0);
  });
});

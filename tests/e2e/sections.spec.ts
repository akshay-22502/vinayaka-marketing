import { expect, test, type Locator, type Page } from "@playwright/test";

// Applications, certifications, projects, about and contact, against the seed:
// six published applications, and no certifications or projects (so those
// sections are hidden). Assertions rely only on seed items, never on counts.

const APPLICATION_PATH = "/applications/roads-and-pavements";

/** Fails when the page itself scrolls sideways (wide content must wrap or scroll inside its own container). */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
}

/**
 * Replaces a rendered Markdown paragraph with a long unbroken URL, the way an
 * admin could paste one. The browser lays the page out again with the real
 * production CSS, so this checks the layout without changing any stored content.
 */
async function pasteLongUnbrokenUrl(paragraph: Locator): Promise<void> {
  await paragraph.first().evaluate((el) => {
    el.textContent = `https://example.com/${"averylongunbrokenpathsegment".repeat(12)}`;
  });
}

test.describe("applications", () => {
  test("the index lists the applications, each linking to its page", async ({ page }) => {
    await page.goto("/applications");
    await expect(page.getByRole("heading", { level: 1, name: "Applications" })).toBeVisible();

    const main = page.getByRole("main");
    for (const [name, slug] of [
      ["Roads and pavements", "roads-and-pavements"],
      ["Slopes and retaining walls", "slopes-and-retaining-walls"],
      ["Landfills and containment", "landfills-and-containment"],
      ["Ponds and canals", "ponds-and-canals"],
      ["Erosion control", "erosion-control"],
      ["Railways", "railways"],
    ]) {
      await expect(main.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
      await expect(main.getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        `/applications/${slug}`,
      );
    }
    // The summary is on the card.
    await expect(main).toContainText("Separation and reinforcement layers");
    // Seed applications have no photo, so the card shows the placeholder drawing.
    await expect(main.locator('img[src="/placeholders/application.svg"]').first()).toBeVisible();
  });

  test("an application lists the products it uses", async ({ page }) => {
    await page.goto(APPLICATION_PATH);
    const main = page.getByRole("main");

    await expect(main.getByRole("heading", { level: 1, name: "Roads and pavements" })).toBeVisible();
    await expect(page).toHaveTitle(/Roads and pavements \| TerraTechBharat/);
    // The body is Markdown.
    await expect(main).toContainText("Weak subgrades rut");

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Applications", exact: true })).toHaveAttribute(
      "href",
      "/applications",
    );

    const used = main.locator('section[aria-labelledby="products-used-heading"]');
    await expect(used.getByRole("heading", { level: 2, name: "Products used" })).toBeVisible();
    await expect(used.getByRole("link", { name: "PP Biaxial Geogrid" })).toHaveAttribute(
      "href",
      "/products/geogrid/pp-biaxial-geogrid",
    );
    await expect(used.getByRole("link", { name: "HDPE Geocell" })).toBeVisible();
    // A product that the seed does not link to this application is not listed.
    await expect(used.getByRole("link", { name: "HDPE Geomembrane" })).toHaveCount(0);
    await expect(used.getByRole("link", { name: "LLDPE Geomembrane" })).toHaveCount(0);

    // Hero image: the placeholder, because the seed application has no photo.
    await expect(main.locator('img[src="/placeholders/application.svg"]').first()).toBeVisible();

    await expect(main.getByRole("link", { name: "Request a quote" })).toHaveAttribute("href", "/quote");
  });

  test("a product card leads to the product page", async ({ page }) => {
    await page.goto(APPLICATION_PATH);
    await page
      .getByRole("main")
      .getByRole("link", { name: "PP Biaxial Geogrid" })
      .click();
    await expect(page).toHaveURL(/\/products\/geogrid\/pp-biaxial-geogrid$/);
    await expect(page.getByRole("heading", { level: 1, name: "PP Biaxial Geogrid" })).toBeVisible();
  });

  test("an unknown application shows the 404 page", async ({ page }) => {
    const response = await page.goto("/applications/not-an-application");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });
});

test.describe("certifications and projects are hidden while empty", () => {
  for (const path of ["/certifications", "/projects", "/projects/some-project"]) {
    test(`${path} shows the 404 page`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    });
  }

  test("no page links to them: not the header, the footer or the home page", async ({ page }) => {
    for (const path of ["/", "/applications", "/about", "/contact", "/certifications"]) {
      await page.goto(path);
      for (const target of ["/certifications", "/projects"]) {
        await expect(page.locator(`a[href="${target}"]`), `${path} links to ${target}`).toHaveCount(0);
      }
      const nav = page.getByRole("banner").getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "About", exact: true })).toBeVisible();
    }
    // Home has no certification or project strips either.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Certifications" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recent projects" })).toHaveCount(0);
  });
});

test.describe("about", () => {
  test("shows the company text and the India and UAE offices", async ({ page }) => {
    await page.goto("/about");
    const main = page.getByRole("main");

    await expect(main.getByRole("heading", { level: 1, name: "About TerraTechBharat" })).toBeVisible();
    await expect(page).toHaveTitle(/About \| TerraTechBharat/);
    // The company text is Markdown from site settings; its headings sit under the page's h1.
    await expect(main.getByRole("heading", { level: 2, name: "What we supply" })).toBeVisible();
    await expect(main.getByRole("heading", { level: 2, name: "How we work" })).toBeVisible();
    await expect(main).toContainText("TerraTechBharat supplies geosynthetic products");
    await expect(main.getByRole("listitem").filter({ hasText: "Geogrids" }).first()).toBeVisible();

    const presence = main.locator('section[aria-labelledby="presence-heading"]');
    await expect(presence.getByRole("heading", { level: 2, name: "India and the UAE" })).toBeVisible();
    await expect(presence).toContainText("[India address]");
    await expect(presence).toContainText("[UAE address]");
    await expect(main.getByRole("link", { name: "Request a quote" })).toHaveAttribute("href", "/quote");
  });
});

test.describe("contact", () => {
  test("shows both offices, with placeholder details as plain text", async ({ page }) => {
    await page.goto("/contact");
    const main = page.getByRole("main");

    await expect(main.getByRole("heading", { level: 1, name: "Contact us" })).toBeVisible();
    await expect(page).toHaveTitle(/Contact \| TerraTechBharat/);

    const india = main.getByRole("region", { name: "India office" });
    const uae = main.getByRole("region", { name: "UAE office" });
    await expect(india.getByRole("heading", { level: 2, name: "India office" })).toBeVisible();
    await expect(uae.getByRole("heading", { level: 2, name: "UAE office" })).toBeVisible();
    for (const [office, label] of [
      [india, "India"],
      [uae, "UAE"],
    ] as const) {
      await expect(office).toContainText(`[${label} address]`);
      await expect(office).toContainText(`[${label} phone]`);
      await expect(office).toContainText(`[${label} WhatsApp]`);
      await expect(office).toContainText(`[${label} email]`);
    }

    // Bracketed placeholders are never tel:, mailto: or wa.me links (ruling R6).
    await expect(main.locator('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')).toHaveCount(0);

    // The quote form is embedded under the offices (tests/e2e/quote.spec.ts covers using it).
    await expect(main.getByRole("heading", { level: 2, name: "Request a quote" })).toBeVisible();
    await expect(main.getByRole("form", { name: "Quote request" })).toBeVisible();
  });
});

test.describe("every new page", () => {
  const paths = ["/applications", APPLICATION_PATH, "/about", "/contact"];

  test("has one h1, the site landmarks, no prices and no old brand name", async ({ page }) => {
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }), `${path} h1`).toHaveCount(1);
      await expect(page.getByRole("banner")).toBeVisible();
      await expect(page.getByRole("contentinfo")).toBeVisible();

      const text = await page.locator("body").innerText();
      const html = await page.content();
      expect(text, `visible text of ${path}`).not.toMatch(/₹|\baed\b|price/i);
      expect(html, `markup of ${path}`).not.toMatch(/₹|\baed\b|price/i);
      expect(html, `markup of ${path}`).not.toMatch(/vinayaka/i);
    }
  });

  test("the quote button is on each of them, except the contact page, which holds the form itself", async ({ page }) => {
    for (const path of paths) {
      await page.goto(path);
      const button = page.getByTestId("quote-fab");
      // On /contact the button would sit on top of the form it points to.
      if (path === "/contact") await expect(button, path).toHaveCount(0);
      else await expect(button, path).toHaveAttribute("href", "/quote");
    }
  });
});

test.describe("at 375px wide", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of ["/applications", APPLICATION_PATH, "/about", "/contact"]) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      // A real page, not the 404 page (which would pass trivially).
      expect((await page.goto(path))?.status()).toBe(200);
      await expectNoHorizontalScroll(page);
    });
  }

  // A long unbroken URL in admin-written Markdown must wrap, not widen the page.
  test("a long URL in an application body wraps", async ({ page }) => {
    await page.goto(APPLICATION_PATH);
    await pasteLongUnbrokenUrl(page.getByRole("main").locator("p").filter({ hasText: "Weak subgrades rut" }));
    await expectNoHorizontalScroll(page);
  });

  test("a long URL in the about text wraps", async ({ page }) => {
    await page.goto("/about");
    await pasteLongUnbrokenUrl(
      page.getByRole("main").locator("p").filter({ hasText: "TerraTechBharat supplies geosynthetic products" }),
    );
    await expectNoHorizontalScroll(page);
  });

  test("a long URL in a product overview wraps", async ({ page }) => {
    await page.goto("/products/geogrid/pp-biaxial-geogrid");
    await pasteLongUnbrokenUrl(page.locator('section[aria-labelledby="overview-heading"] p'));
    await expectNoHorizontalScroll(page);
  });
});

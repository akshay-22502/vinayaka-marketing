import { expect, test, type Page } from "@playwright/test";

// Runs against the seeded catalogue with every seed product published
// (scripts/e2e-prepare.ts). Assertions only rely on seed items, and never on
// how many items exist, so other specs may add their own content.

const PRODUCT_PATH = "/products/geogrid/pp-biaxial-geogrid";
const CATEGORY_NAMES = ["Geogrid", "Geomembrane", "Geotextile", "Geocell"];

/** Fails when the page itself scrolls sideways (wide content must scroll inside its own container). */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
}

test.describe("catalogue", () => {
  test("home shows a tile for each product line", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Not an exact count: other specs may publish categories of their own.
    const tiles = page.getByTestId("category-tile");
    for (const name of CATEGORY_NAMES) {
      await expect(tiles.getByRole("heading", { name, exact: true })).toBeVisible();
    }
  });

  test("browse from home through Geogrid to a product with its spec table", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("category-tile").filter({ hasText: "Geogrid" }).first().click();
    await expect(page).toHaveURL(/\/products\/geogrid$/);
    await expect(page.getByRole("heading", { level: 1, name: "Geogrid" })).toBeVisible();

    await page.getByRole("link", { name: /PP Biaxial Geogrid/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`${PRODUCT_PATH}$`));
    await expect(page.getByRole("heading", { level: 1, name: "PP Biaxial Geogrid" })).toBeVisible();

    // The breadcrumb names the category (not its slug) and links back to it.
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Geogrid", exact: true })).toHaveAttribute(
      "href",
      "/products/geogrid",
    );

    // Spec table: one column per model, empty cells would show a dash.
    const table = page.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "BX1515" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "BX4040" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Property" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Test method" })).toBeVisible();

    // The in-page call to action pre-fills the quote form.
    const quoteLink = page.getByRole("main").getByRole("link", { name: "Request a quote" });
    await expect(quoteLink).toHaveAttribute("href", "/quote?product=pp-biaxial-geogrid");
  });

  test("product page sections appear in order, and the datasheet button is hidden without a file", async ({
    page,
  }) => {
    await page.goto(PRODUCT_PATH);

    const order = ["Overview", "Features", "Specifications", "Applications"];
    const tops: number[] = [];
    for (const name of order) {
      const heading = page.getByRole("heading", { level: 2, name, exact: true });
      await expect(heading).toBeVisible();
      tops.push((await heading.boundingBox())!.y);
    }
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);

    // The product's default render, because the seed product has no photos. Webp goes through the optimizer.
    await expect(page.locator('img[src*="pp-biaxial-geogrid.webp"]').first()).toBeVisible();

    // Application chips link to the application pages.
    await expect(
      page.getByRole("main").getByRole("link", { name: "Roads and pavements" }),
    ).toHaveAttribute("href", "/applications/roads-and-pavements");

    // The seed has no datasheet file.
    await expect(page.getByRole("link", { name: /datasheet/i })).toHaveCount(0);
  });

  test("a product under the wrong category shows the 404 page", async ({ page }) => {
    const response = await page.goto("/products/geomembrane/pp-biaxial-geogrid");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    // The 404 page keeps the site header, so visitors can carry on.
    await expect(page.getByRole("banner").getByRole("link", { name: /Products/ }).first()).toBeVisible();
  });

  test("an unknown category shows the 404 page", async ({ page }) => {
    const response = await page.goto("/products/not-a-category");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });

  test("an address that matches no page shows the 404 page", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });

  test("shows no prices", async ({ page }) => {
    const paths = ["/", "/products", "/products/geogrid", PRODUCT_PATH];
    for (const path of paths) {
      await page.goto(path);
      const text = await page.locator("body").innerText();
      const html = await page.content();
      expect(text, `visible text of ${path}`).not.toMatch(/₹|\baed\b|price/i);
      expect(html, `markup of ${path}`).not.toMatch(/₹|\baed\b|price/i);
      expect(html, `markup of ${path}`).not.toMatch(/vinayaka/i);
    }
  });

  test("layout landmarks, skip link and navigation", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();

    const nav = page.getByRole("banner").getByRole("navigation", { name: "Main" });
    for (const name of ["Products", "Applications", "About", "Contact"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    // Certifications and Projects appear only when there are published entries.
    await expect(nav.getByRole("link", { name: "Certifications" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Projects" })).toHaveCount(0);

    // Skip link is the first tab stop and jumps to the main content.
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);

    // Both offices in the footer.
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("heading", { name: "India office" })).toBeVisible();
    await expect(footer.getByRole("heading", { name: "UAE office" })).toBeVisible();
  });

  test("the quote button is on every page and follows the product being viewed", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByTestId("quote-fab")).toHaveAttribute("href", "/quote");

    await page.goto(PRODUCT_PATH);
    await expect(page.getByTestId("quote-fab")).toHaveAttribute(
      "href",
      "/quote?product=pp-biaxial-geogrid",
    );
  });

  test("the page leaves room below a focused element so the floating quote button does not cover it", async ({ page }) => {
    await page.goto("/products");
    const button = page.getByTestId("quote-fab");
    const room = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom));
    const covered = (await button.boundingBox())!;
    const viewportHeight = page.viewportSize()!.height;
    // scroll-padding-bottom reaches from the viewport's bottom edge past the button's top edge.
    expect(room).toBeGreaterThanOrEqual(viewportHeight - covered.y);
  });

  test("placeholder office details are plain text, not links", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("[India phone]");
    await expect(footer).toContainText("[UAE email]");
    await expect(footer.locator('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')).toHaveCount(0);
  });

  test.describe("at 375px wide", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("home does not scroll sideways", async ({ page }) => {
      await page.goto("/");
      await expectNoHorizontalScroll(page);
    });

    test("product page does not scroll sideways, the spec table scrolls inside its own container", async ({
      page,
    }) => {
      await page.goto(PRODUCT_PATH);
      await expectNoHorizontalScroll(page);

      const scroller = page.getByTestId("spec-table-scroll");
      const { scrollWidth, clientWidth } = await scroller.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(scrollWidth).toBeGreaterThan(clientWidth);
      // Keyboard users can scroll it too.
      await expect(scroller).toHaveAttribute("tabindex", "0");
    });

    test("the pinned Property column stays solid and on top while the table scrolls", async ({
      page,
    }) => {
      await page.goto(PRODUCT_PATH);
      const scroller = page.getByTestId("spec-table-scroll");
      await scroller.scrollIntoViewIfNeeded();
      await scroller.evaluate((el) => {
        el.scrollLeft = 200;
      });
      expect(await scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

      const table = page.getByRole("table");
      const headerCell = table.getByRole("columnheader", { name: "Property" });
      const bodyCell = table.getByRole("rowheader").first();
      for (const cell of [headerCell, bodyCell]) {
        // Opaque background, so the cells scrolling underneath do not show through.
        const background = await cell.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(background, "pinned cell background").not.toMatch(/rgba\(.*,\s*0\)|transparent/);

        // And it is the topmost box at its own centre (stacked above the scrolling cells).
        const onTop = await cell.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return hit === el || el.contains(hit);
        });
        expect(onTop, "pinned cell is on top").toBe(true);
      }
    });

    test("the menu opens and closes with the keyboard", async ({ page }) => {
      await page.goto("/");
      const button = page.getByRole("button", { name: "Menu" });
      await expect(button).toHaveAttribute("aria-expanded", "false");

      await button.focus();
      await page.keyboard.press("Enter");
      await expect(button).toHaveAttribute("aria-expanded", "true");
      const mobileNav = page.getByRole("navigation", { name: "Mobile" });
      await expect(mobileNav.getByRole("link", { name: "Products", exact: true })).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(button).toBeFocused();
      await expect(mobileNav).toHaveCount(0);
    });

    test("choosing a link in the menu navigates and closes it", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "Menu" }).click();
      await page
        .getByRole("navigation", { name: "Mobile" })
        .getByRole("link", { name: "Products", exact: true })
        .click();
      await expect(page).toHaveURL(/\/products$/);
      await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute("aria-expanded", "false");
    });
  });
});

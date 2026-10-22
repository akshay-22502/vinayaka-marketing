import { expect, test, type Page } from "@playwright/test";
import { stubGtag } from "../support/gtag";

// The Google Analytics tag, with the E2E build's made-up Measurement ID and a stubbed gtag.js
// (see tests/support/gtag.ts).

const ID = "G-E2ETEST123";

/** The gtag commands queued so far, as plain arrays such as ["config", "G-..."]. */
async function dataLayer(page: Page): Promise<unknown[][]> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((entry) => Array.from(entry)),
  );
}

test("public pages load the tag with the configured ID", async ({ page }) => {
  const requested = await stubGtag(page);
  await page.goto("/");
  await expect.poll(() => requested.length).toBe(1);
  expect(requested[0]).toBe(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
  await expect.poll(() => dataLayer(page)).toContainEqual(["config", ID]);
});

test("the admin area never loads it", async ({ page }) => {
  const requested = await stubGtag(page);
  await page.goto("/admin/login");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requested).toEqual([]);
  expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe("undefined");
});

test("a sent quote request is reported as generate_lead, without personal details", async ({ page }) => {
  await stubGtag(page);
  // A mocked answer, so the test never reaches the rate limiter or the database.
  await page.route("**/api/quote", (route) =>
    route.fulfill({ status: 200, json: { ok: true, id: "11111111-1111-4111-8111-111111111111", team: "AE" } }),
  );
  await page.goto("/quote?product=pp-biaxial-geogrid");
  await expect.poll(() => dataLayer(page)).toContainEqual(["config", ID]);

  await page.getByLabel("Name", { exact: true }).fill("Asha Verma");
  await page.getByLabel("Email", { exact: true }).fill("asha@example.com");
  await page.getByLabel("Phone", { exact: true }).fill("+971 50 123 4567");
  await page.getByRole("radio", { name: "UAE", exact: true }).check();
  await page.getByLabel("Message", { exact: true }).fill("Please quote for a canal lining, about 12,000 m2.");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: /Our UAE team will reply/ })).toBeVisible();

  const events = (await dataLayer(page)).filter((entry) => entry[0] === "event");
  expect(events).toEqual([["event", "generate_lead", { form_name: "quote_request", country: "AE", product_count: 1 }]]);
  expect(JSON.stringify(events)).not.toMatch(/Asha|example\.com|\+971|canal/);
});

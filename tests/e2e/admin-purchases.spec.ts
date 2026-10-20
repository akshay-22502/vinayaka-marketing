import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../../scripts/lib/e2e-users";
import { BASE_URL, signInWithCookie } from "../support/admin-session";
import { expectNoHorizontalScroll, rowLink, saveForm, service, withTimeout } from "../support/admin-e2e";

// Suppliers and purchases (/admin/suppliers, /admin/purchases), as the signed-in admin
// (admin@e2e.test): add a supplier, a purchase from it with a product and costs, check the landed
// cost, then delete. Every supplier a test makes has this run's tag in its name, and the afterEach
// deletes them and their purchases with the service role, so a failed test leaves nothing behind.

const RUN = Date.now().toString(36);
const supplierName = (tag: string) => `E2E ${tag} ${RUN}`;

test.beforeEach(async ({ context }) => {
  await signInWithCookie(context, E2E_ADMIN_EMAIL);
});

test.afterEach(async () => {
  await withTimeout(
    (async () => {
      const db = service();
      const { data } = await db.from("suppliers").select("id").like("name", `E2E % ${RUN}`);
      const ids = (data ?? []).map((row) => row.id as string);
      if (ids.length === 0) return;
      await db.from("purchases").delete().in("supplier_id", ids);
      await db.from("suppliers").delete().in("id", ids);
    })(),
    10_000,
    "supplier cleanup",
  );
});

async function createSupplier(page: Page, name: string) {
  await page.goto("/admin/suppliers/new");
  await page.getByLabel("Company").fill(name);
  await page.getByLabel("City / province").fill("Tai'an, Shandong");
  await page.getByLabel("Mobile / WhatsApp / WeChat").fill("+86 138 0000 0000");
  await saveForm(page);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("a visitor without a session is sent to the login page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const path of ["/admin/suppliers", "/admin/purchases"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
  await context.close();
});

test("a purchase from a supplier adds up to a landed cost per roll and per square metre", async ({ page }) => {
  const name = supplierName("supplier");
  await createSupplier(page, name);
  await expect(page.getByText("China")).toBeVisible();

  // A purchase from this supplier: its page's button picks the supplier.
  await page.getByRole("link", { name: "New purchase" }).click();
  await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await page.getByLabel("Order / invoice number").fill(`PO-${RUN}`);
  await page.getByLabel("Imported into").selectOption({ label: "India (costs in INR)" });
  await page.getByLabel("Exchange rate").fill("80");
  await page.getByLabel("Container", { exact: true }).selectOption({ label: "40 ft high cube" });
  await saveForm(page);
  const title = `${name} · PO-${RUN}`;
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  // A product: 10 rolls of 350 m² at $0.50 per m² = $1,750 = ₹1,40,000.
  const addItem = page.getByRole("region", { name: "Add a product" });
  await addItem.getByRole("button", { name: "Add product" }).click();
  await expect(addItem.getByRole("alert").filter({ hasText: "Choose a product or describe it" })).toBeVisible();
  await addItem.getByLabel("Description").fill("HDPE 1.5 mm, 7 m × 50 m");
  await addItem.getByLabel("Rolls").fill("10");
  await addItem.getByLabel("Square metres per roll").fill("350");
  await addItem.getByLabel("Price (USD)").fill("0.5");
  await addItem.getByRole("button", { name: "Add product" }).click();
  const products = page.getByRole("region", { name: "Products" });
  await expect(products.getByText("HDPE 1.5 mm, 7 m × 50 m")).toBeVisible();
  await expect(products.getByText("₹1,40,000.00").first()).toBeVisible();
  await expect(addItem.getByLabel("Rolls")).toHaveValue("");

  // Freight of $1,000 (₹80,000) counts; IGST that is claimed back does not.
  const addCost = page.getByRole("region", { name: "Add a cost" });
  await addCost.getByLabel("Cost", { exact: true }).selectOption({ label: "Sea freight" });
  await addCost.getByLabel("Amount").fill("1,000");
  await addCost.getByLabel("Paid in").selectOption({ label: "USD (supplier's currency)" });
  await addCost.getByRole("button", { name: "Add cost" }).click();
  const costs = page.getByRole("region", { name: "Shipping and import costs" });
  await expect(costs.getByRole("listitem").first()).toContainText("Sea freight");

  await addCost.getByLabel("Cost", { exact: true }).selectOption({ label: "IGST / VAT on import" });
  await addCost.getByLabel("Amount").fill("5000");
  await addCost.getByLabel("Count in the landed cost").uncheck();
  await addCost.getByRole("button", { name: "Add cost" }).click();
  await expect(costs.getByText("(not counted in the landed cost)")).toBeVisible();

  // ₹1,40,000 + ₹80,000 = ₹2,20,000 for 3,500 m²: ₹62.86 per m², ₹22,000 per roll.
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByText("₹2,20,000.00")).toBeVisible();
  await expect(summary.getByText("₹62.86")).toBeVisible();
  await expect(summary.getByText("Not counted (tax claimed back): ₹5,000.00")).toBeVisible();
  await expect(products.getByText("₹22,000.00 / roll")).toBeVisible();

  // Edit the line: 20 rolls doubles the goods.
  await products.getByText("Edit this product line").click();
  await products.locator("details[open]").getByLabel("Rolls").fill("20");
  await products.locator("details[open]").getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary.getByText("7,000 m²")).toBeVisible();

  // The purchase shows on the list and on the supplier's page.
  await page.goto("/admin/purchases?destination=IN");
  await expect(rowLink(page, title)).toBeVisible();
  await page.goto("/admin/suppliers");
  await rowLink(page, name).click();
  await expect(page.getByRole("region", { name: "Purchases" }).getByRole("link", { name: title })).toBeVisible();

  // A supplier with purchases cannot be deleted.
  await page.getByRole("button", { name: "Delete supplier" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This supplier has purchases" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).last().click();

  // Delete a cost, then the purchase, then the supplier.
  await page.getByRole("region", { name: "Purchases" }).getByRole("link", { name: title }).click();
  await costs.getByRole("button", { name: "Delete cost" }).first().click();
  await costs.getByRole("button", { name: "Yes, delete" }).click();
  await expect(costs.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "Delete purchase" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(`${BASE_URL}/admin/purchases`);
  await expect(rowLink(page, title)).toHaveCount(0);

  await page.goto("/admin/suppliers");
  await rowLink(page, name).click();
  await page.getByRole("button", { name: "Delete supplier" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(`${BASE_URL}/admin/suppliers`);
  await expect(rowLink(page, name)).toHaveCount(0);
});

test("a purchase needs a supplier, a country and an exchange rate", async ({ page }) => {
  await createSupplier(page, supplierName("required"));
  await page.goto("/admin/purchases/new");
  await saveForm(page);
  await expect(page.getByRole("alert").filter({ hasText: "Choose a supplier" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Choose where the goods go" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the exchange rate" })).toBeVisible();
});

test("the supplier and purchase pages do not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const name = supplierName("phone");
  await createSupplier(page, name);
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "New purchase" }).click();
  await page.getByLabel("Imported into").selectOption({ label: "United Arab Emirates (costs in AED)" });
  await page.getByLabel("Exchange rate").fill("3.6725");
  await saveForm(page);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const addItem = page.getByRole("region", { name: "Add a product" });
  await addItem.getByLabel("Description").fill("PP biaxial geogrid 30 kN/m");
  await addItem.getByLabel("Rolls").fill("40");
  await addItem.getByLabel("Square metres per roll").fill("200");
  await addItem.getByLabel("Price is").selectOption({ label: "Per roll" });
  await addItem.getByLabel("Price (USD)").fill("96");
  await addItem.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("region", { name: "Products" }).getByText("PP biaxial geogrid 30 kN/m")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/admin/purchases");
  await expect(rowLink(page, name)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

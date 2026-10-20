import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../../scripts/lib/e2e-users";
import { BASE_URL, signInWithCookie } from "../support/admin-session";
import { expectNoHorizontalScroll, rowLink, rowOf, saveForm, service, withTimeout } from "../support/admin-e2e";

// The wholesale buyers list (/admin/buyers), as the signed-in admin (admin@e2e.test): create a buyer,
// log updates that move its status, edit it, delete a note and the buyer. Every buyer a test makes
// has this run's tag in its name, and the afterEach deletes them with the service role, so a failed
// test leaves nothing behind for the next run.

const RUN = Date.now().toString(36);
const company = (tag: string) => `E2E ${tag} ${RUN}`;

test.beforeEach(async ({ context }) => {
  await signInWithCookie(context, E2E_ADMIN_EMAIL);
});

test.afterEach(async () => {
  await withTimeout(
    (async () => {
      await service().from("wholesale_buyers").delete().like("company", `E2E % ${RUN}`);
    })(),
    10_000,
    "buyer cleanup",
  );
});

async function createBuyer(page: Page, name: string, country: "India" | "United Arab Emirates (UAE)") {
  await page.goto("/admin/buyers/new");
  await page.getByLabel("Company").fill(name);
  await page.getByLabel("Country").selectOption({ label: country });
  await page.getByLabel("Priority").selectOption({ label: "High" });
  await page.getByLabel("Mobile / WhatsApp").fill("+971 50 123 4567");
  await page.getByLabel("Email").fill("buyer@example.com");
  await saveForm(page);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("a visitor without a session is sent to the login page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/admin/buyers");
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.close();
});

test("a new buyer gets notes that move its status, can be edited, and is deleted with its notes", async ({ page }) => {
  const name = company("lifecycle");
  await createBuyer(page, name, "United Arab Emirates (UAE)");

  await expect(page.getByRole("main").locator("span", { hasText: /^Not contacted$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/971501234567");
  await expect(page.getByRole("link", { name: "Email", exact: true })).toHaveAttribute("href", "mailto:buyer@example.com");

  // An empty update is refused.
  await page.getByRole("button", { name: "Add update" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Write a note or choose a new status" })).toBeVisible();

  // A note that moves the buyer on.
  const update = page.getByRole("region", { name: "Add an update" });
  await update.getByLabel("Status").selectOption({ label: "In discussion" });
  await update.getByLabel("Note").fill("Spoke to the purchase manager.\nSending samples.");
  await update.getByRole("button", { name: "Add update" }).click();
  const notes = page.getByRole("region", { name: "Notes" });
  await expect(notes.getByText("Spoke to the purchase manager.")).toBeVisible();
  await expect(notes.getByText("Status set to")).toBeVisible();
  await expect(update.getByLabel("Note")).toHaveValue("");
  await expect(update.getByLabel("Status")).toHaveValue("in_discussion");

  // A plain note.
  await update.getByLabel("Note").fill("Samples dispatched");
  await update.getByRole("button", { name: "Add update" }).click();
  await expect(notes.getByText("Samples dispatched")).toBeVisible();
  await expect(notes.getByRole("listitem")).toHaveCount(2);

  // The list shows the new status and filters by it.
  await page.goto("/admin/buyers?status=in_discussion");
  await expect(rowOf(page, name)).toContainText("In discussion");
  await page.goto("/admin/buyers?status=onboarded");
  await expect(rowLink(page, name)).toHaveCount(0);
  await page.goto(`/admin/buyers?q=${encodeURIComponent(`lifecycle ${RUN}`)}`);
  await expect(rowLink(page, name)).toBeVisible();

  // Edit the details.
  await rowLink(page, name).click();
  const details = page.getByRole("region", { name: "Details" });
  await details.getByLabel("Contact person").fill("R. Kumar");
  await saveForm(page);
  await expect(details.locator('[role="status"]')).toHaveText("Saved.");
  await page.reload();
  await expect(details.getByLabel("Contact person")).toHaveValue("R. Kumar");

  // Delete the first note, then the buyer.
  await notes.getByRole("button", { name: "Delete note" }).first().click();
  await notes.getByRole("button", { name: "Yes, delete" }).click();
  await expect(notes.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "Delete buyer" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(`${BASE_URL}/admin/buyers`);
  await expect(rowLink(page, name)).toHaveCount(0);
});

test("a buyer needs a company and a country", async ({ page }) => {
  await page.goto("/admin/buyers/new");
  await saveForm(page);
  await expect(page.getByRole("alert").filter({ hasText: "Enter the company name" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Choose a country" })).toBeVisible();
});

test("the buyer list and page do not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const name = company("phone");
  await createBuyer(page, name, "India");
  await expectNoHorizontalScroll(page);
  await page.goto("/admin/buyers");
  await expect(rowLink(page, name)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

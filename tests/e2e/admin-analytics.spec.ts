import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../../scripts/lib/e2e-users";
import { signInWithCookie } from "../support/admin-session";
import { expectNoHorizontalScroll } from "../support/admin-e2e";

// Admin > Analytics. The E2E server has no GA_PROPERTY_ID or GA_SERVICE_ACCOUNT_KEY (and cannot reach
// Google), so this checks the page as it is before setup; tests/unit/ga-report.test.ts covers the
// Google calls and the report itself.

test("a visitor without a session is sent to the login page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/admin/analytics");
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.close();
});

test.describe("signed in", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
  });

  test("the menu links to it, and before setup it names the missing settings", async ({ page }) => {
    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/admin\/analytics$/);
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    const notice = page.getByRole("status").filter({ hasText: "not connected" });
    await expect(notice).toContainText("GA_PROPERTY_ID");
    await expect(notice).toContainText("GA_SERVICE_ACCOUNT_KEY");
  });

  test("offers 7, 28 and 90 days, 28 by default, and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/analytics");
    const period = page.getByRole("group", { name: "Period" });
    await expect(period.getByRole("link", { name: "28 days" })).toHaveAttribute("aria-current", "true");
    await period.getByRole("link", { name: "7 days" }).click();
    await expect(page).toHaveURL(/range=7$/);
    await expect(period.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "true");
    await expectNoHorizontalScroll(page);
  });
});

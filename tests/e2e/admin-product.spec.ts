import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../../scripts/lib/e2e-users";
import { toSpecGrid } from "../../src/lib/content/spec-grid";
import type { SpecGrid } from "../../src/lib/content/types";
import { BASE_URL, signInWithCookie } from "../support/admin-session";
import {
  PDF,
  deleteViaAdmin,
  expectNoHorizontalScroll,
  formAlert,
  png,
  publicStatus,
  publishedBox,
  rowLink,
  rowOf,
  saveForm,
  savedStatus,
  service,
  withTimeout,
} from "../support/admin-e2e";

// The product editor in /admin/products: the product form and the spreadsheet-style spec grid, as
// the signed-in admin (admin@e2e.test).
//
// Ruling R10: tests that change content put it back before they finish, even when an assertion
// fails. Products a test creates are deleted through the admin screens. The seeded PP Biaxial
// Geogrid's spec table is checked against a snapshot taken before the first test: after each test
// the table is put back through the admin screen (BX5050 and the E2E property removed), and if
// it still differs the snapshot is written back with the service role. Every cleanup step has an
// explicit timeout so a hang cannot skip the fallback.

const RUN = Date.now().toString(36);
const CLEANUP_STEP_MS = 10_000;
const CLEANUP_TOTAL_MS = 45_000;

const SLUG_TAKEN = "This URL slug is already used";
const SEED_PRODUCT = "PP Biaxial Geogrid";
const SEED_SLUG = "pp-biaxial-geogrid";
const SEED_PUBLIC_PATH = `/products/geogrid/${SEED_SLUG}`;
const SEED_MODELS = ["BX1515", "BX2020", "BX3030", "BX4040"];
const TENSILE = "Tensile strength, MD / XMD";
const REMINDER = "_Typical values. Confirm against the manufacturer's datasheet before publishing._";

// The spec editor ------------------------------------------------------------------------------

const editor = (page: Page) => page.getByTestId("spec-grid-editor");
const editorStatus = (page: Page) => editor(page).getByRole("status");
const editorAlert = (page: Page) => editor(page).getByRole("alert");
const saveGridButton = (page: Page) => editor(page).getByRole("button", { name: "Save specification table", exact: true });
const modelCode = (page: Page, position: number) => editor(page).getByLabel(`Model ${position} code`, { exact: true });
const cell = (page: Page, model: string, property: string) =>
  editor(page).getByLabel(`${model} – ${property}`, { exact: true });

async function saveGrid(page: Page): Promise<void> {
  await saveGridButton(page).click();
  await expect(editorStatus(page)).toHaveText("Saved.");
}

async function addModel(page: Page, position: number, code: string): Promise<void> {
  await editor(page).getByRole("button", { name: "Add model", exact: true }).click();
  await expect(modelCode(page, position)).toBeFocused();
  await modelCode(page, position).fill(code);
}

/** The seeded product's id, the spec tables as they were before this file changed anything. */
let seedProductId = "";
let seedGrid: SpecGrid;
let seedRows: { models: unknown[]; properties: unknown[]; values: unknown[] };

async function readStoredGrid(client: SupabaseClient, productId: string): Promise<SpecGrid> {
  const [models, properties] = await Promise.all([
    client.from("spec_models").select("id, code, sort_order").eq("product_id", productId),
    client
      .from("spec_properties")
      .select("id, name, unit, test_method, sort_order, spec_values(property_id, model_id, value)")
      .eq("product_id", productId),
  ]);
  if (models.error || properties.error) throw new Error("Could not read the spec table with the service role");
  const rows = properties.data as unknown as { spec_values: { property_id: string; model_id: string; value: string }[] }[];
  return toSpecGrid(
    models.data as never,
    properties.data as never,
    rows.flatMap((property) => property.spec_values),
  );
}

async function snapshotSeedTable(): Promise<void> {
  const client = service();
  const product = await client.from("products").select("id").eq("slug", SEED_SLUG).single();
  if (product.error) throw new Error(`Could not find ${SEED_SLUG}: ${product.error.message}`);
  seedProductId = product.data.id;

  const models = await client.from("spec_models").select("*").eq("product_id", seedProductId);
  const properties = await client.from("spec_properties").select("*").eq("product_id", seedProductId);
  const values = await client
    .from("spec_values")
    .select("*")
    .in("property_id", (properties.data ?? []).map((property) => property.id as string));
  if (models.error || properties.error || values.error) throw new Error("Could not snapshot the seed spec table");
  seedRows = { models: models.data, properties: properties.data, values: values.data };
  seedGrid = await readStoredGrid(client, seedProductId);
  // The other specs assert this state, so a leftover from an earlier run would make every result below meaningless.
  expect(seedGrid.models, "the seed spec table is intact before this spec starts").toEqual(SEED_MODELS);
}

/** Writes the snapshot back with the service role (the fallback when the admin screen could not). */
async function restoreSeedTable(): Promise<void> {
  const client = service();
  const steps = [
    await client.from("spec_models").delete().eq("product_id", seedProductId),
    await client.from("spec_properties").delete().eq("product_id", seedProductId),
    await client.from("spec_models").insert(seedRows.models),
    await client.from("spec_properties").insert(seedRows.properties),
    await client.from("spec_values").insert(seedRows.values),
  ];
  const failed = steps.find((step) => step.error);
  if (failed?.error) throw new Error(`Could not restore the seed spec table: ${failed.error.message}`);
}

/** Puts the seeded table back through the admin screen: removes what the tests add. */
async function revertSeedTableViaAdmin(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  page.setDefaultTimeout(CLEANUP_STEP_MS);
  page.on("dialog", (dialog) => dialog.accept().catch(() => undefined));
  try {
    await page.goto(`/admin/products/${seedProductId}`, { timeout: CLEANUP_STEP_MS });
    await expect(editor(page)).toBeVisible({ timeout: CLEANUP_STEP_MS });
    let changed = false;
    for (const name of ["Remove model BX5050", "Remove property E2E property"]) {
      const button = editor(page).getByRole("button", { name, exact: true });
      if ((await button.count()) > 0) {
        await button.click({ timeout: CLEANUP_STEP_MS });
        changed = true;
      }
    }
    if (changed) {
      await saveGridButton(page).click({ timeout: CLEANUP_STEP_MS });
      await expect(editorStatus(page)).toHaveText("Saved.", { timeout: CLEANUP_STEP_MS });
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** After the fallback wrote the table directly, a no-op save from the admin screen refreshes the public pages. */
async function refreshPublicPages(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  page.setDefaultTimeout(CLEANUP_STEP_MS);
  try {
    await page.goto(`/admin/products/${seedProductId}`, { timeout: CLEANUP_STEP_MS });
    await saveGridButton(page).click({ timeout: CLEANUP_STEP_MS });
    await expect(editorStatus(page)).toHaveText("Saved.", { timeout: CLEANUP_STEP_MS });
  } finally {
    await page.close().catch(() => undefined);
  }
}

// Cleanup registered by tests -------------------------------------------------------------------

type Cleanup = { run: (context: BrowserContext) => Promise<void>; fallback: () => Promise<unknown> };
const cleanups: Cleanup[] = [];

/** Registers the removal of products a test creates, under any of the names it gives them. */
function cleanUpProducts(names: string[]): void {
  cleanups.push({
    run: async (context) => {
      const page = await context.newPage();
      page.setDefaultTimeout(CLEANUP_STEP_MS);
      try {
        for (const name of names) await deleteViaAdmin(page, "products", name, CLEANUP_STEP_MS);
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    fallback: async () => service().from("products").delete().in("name", names),
  });
}

test.beforeAll(snapshotSeedTable);

test.beforeEach(async ({ context }) => {
  await signInWithCookie(context, E2E_ADMIN_EMAIL);
});

test.afterEach(async ({ context }) => {
  let firstError: unknown;
  const remember = (error: unknown) => {
    firstError ??= error;
  };

  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await withTimeout(cleanup.run(context), CLEANUP_TOTAL_MS, "cleanup");
    } catch (error) {
      remember(error);
      await cleanup.fallback();
    }
  }

  // The seeded spec table must be exactly as it was, whatever the test did.
  try {
    await withTimeout(revertSeedTableViaAdmin(context), CLEANUP_TOTAL_MS, "spec table revert");
  } catch (error) {
    remember(error);
  }
  const now = await readStoredGrid(service(), seedProductId);
  if (JSON.stringify(now) !== JSON.stringify(seedGrid)) {
    remember(new Error("The spec table of the seed product was left changed; it was restored from the snapshot"));
    await restoreSeedTable();
    await withTimeout(refreshPublicPages(context), CLEANUP_TOTAL_MS, "refresh").catch(() => undefined);
  }

  if (firstError) throw firstError;
});

// Small helpers --------------------------------------------------------------------------------

async function openProduct(page: Page, name: string): Promise<void> {
  await page.goto("/admin/products");
  await rowLink(page, name).click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Edit product" })).toBeVisible();
}

const publicSpecTable = (page: Page) => page.getByRole("table", { name: `${SEED_PRODUCT} specifications` });

/** The cells of the public table's row for a property. */
const publicRow = (page: Page, property: string) =>
  publicSpecTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: property, exact: true }) })
    .getByRole("cell");

async function publicColumnHeaders(page: Page): Promise<string[]> {
  const headers = await publicSpecTable(page).getByRole("columnheader").allInnerTexts();
  return headers.slice(3); // Property, Unit, Test method, then the models
}

const field = (page: Page, label: string, opts: { exact?: boolean } = { exact: true }): Locator => page.getByLabel(label, opts);

// ----------------------------------------------------------------------------------------------

test.describe("who can open the screens", () => {
  test("a visitor without a session is sent to the login page", async ({ request }) => {
    for (const path of ["/admin/products", "/admin/products/new", `/admin/products/${randomUUID()}`]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeGreaterThanOrEqual(300);
      expect(response.status(), path).toBeLessThan(400);
      expect(response.headers()["location"], path).toContain("/admin/login");
    }
  });

  test("an id that is not a product is a 404 for an admin", async ({ page }) => {
    expect((await page.goto("/admin/products/not-an-id"))?.status()).toBe(404);
    expect((await page.goto(`/admin/products/${randomUUID()}`))?.status()).toBe(404);
  });
});

test.describe("the product list", () => {
  test("lists the seeded products with their category and status, and offers a new product", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    await expect(page).toHaveTitle("Products | Admin | TerraTechBharat");
    await expect(page.getByRole("link", { name: "New product" })).toHaveAttribute("href", "/admin/products/new");

    for (const name of [
      "PP Biaxial Geogrid",
      "Polyester Uniaxial Geogrid",
      "HDPE Geomembrane",
      "LLDPE Geomembrane",
      "Woven Geotextile",
      "Nonwoven Geotextile",
      "HDPE Geocell",
    ]) {
      await expect(rowLink(page, name), name).toBeVisible();
    }
    await expect(rowOf(page, SEED_PRODUCT)).toContainText("Geogrid");
    await expect(rowOf(page, SEED_PRODUCT)).toContainText("Published");
    await expect(rowOf(page, "HDPE Geomembrane")).toContainText("Geomembrane");
  });
});

test.describe("the spec grid editor", () => {
  test("adding the model BX5050 with a tensile value of 50 puts a BX5050 column on the public product page", async ({ page }) => {
    await openProduct(page, SEED_PRODUCT);

    // The stored table is shown as a grid: models as columns, properties as rows.
    await expect(page.getByRole("heading", { level: 2, name: "Specification table" })).toBeVisible();
    for (const [index, code] of SEED_MODELS.entries()) await expect(modelCode(page, index + 1)).toHaveValue(code);
    await expect(cell(page, "BX1515", TENSILE)).toHaveValue("15 / 15");
    await expect(cell(page, "BX4040", TENSILE)).toHaveValue("40 / 40");
    await expect(editor(page).getByLabel("Property 1 name", { exact: true })).toHaveValue(TENSILE);
    await expect(editor(page).getByLabel(`${TENSILE} – unit`, { exact: true })).toHaveValue("kN/m");
    await expect(editor(page).getByLabel(`${TENSILE} – test method`, { exact: true })).toHaveValue("ASTM D6637");
    await expect(editorStatus(page)).toHaveText("No unsaved changes");

    await addModel(page, 5, "BX5050");
    await expect(editorStatus(page)).toHaveText("Unsaved changes");
    await cell(page, "BX5050", TENSILE).fill("50");

    // No optimistic UI: until the save has come back the site is as it was.
    const before = await (await page.request.get(SEED_PUBLIC_PATH)).text();
    expect(before).not.toContain("BX5050");
    await saveGridButton(page).click();
    await expect(editorStatus(page)).toHaveText("Saved.");

    // The public page shows the new column: the value where it was typed, a dash everywhere else.
    await page.goto(SEED_PUBLIC_PATH);
    await expect(publicSpecTable(page).getByRole("columnheader", { name: "BX5050" })).toBeVisible();
    expect(await publicColumnHeaders(page)).toEqual([...SEED_MODELS, "BX5050"]);
    await expect(publicRow(page, TENSILE).last()).toHaveText("50");
    await expect(publicRow(page, "Junction efficiency").last()).toHaveText("–");
    await expect(publicRow(page, TENSILE).first()).toHaveText("kN/m");
    await expect(publicRow(page, TENSILE).nth(2)).toHaveText("15 / 15");

    // The editor shows the saved table again after a reload.
    await openProduct(page, SEED_PRODUCT);
    await expect(modelCode(page, 5)).toHaveValue("BX5050");
    await expect(cell(page, "BX5050", TENSILE)).toHaveValue("50");
    await expect(editorStatus(page)).toHaveText("No unsaved changes");

    // Remove the column again (this is also the revert) and save.
    await editor(page).getByRole("button", { name: "Remove model BX5050", exact: true }).click();
    await expect(modelCode(page, 5)).toHaveCount(0);
    await expect(editorStatus(page)).toHaveText("Unsaved changes");
    await saveGrid(page);
    await page.goto(SEED_PUBLIC_PATH);
    expect(await publicColumnHeaders(page)).toEqual(SEED_MODELS);

    // Adding a model and taking it out again leaves nothing to save.
    await openProduct(page, SEED_PRODUCT);
    await addModel(page, 5, "BX5050");
    await expect(editorStatus(page)).toHaveText("Unsaved changes");
    await editor(page).getByRole("button", { name: "Remove model BX5050", exact: true }).click();
    await expect(editorStatus(page)).toHaveText("No unsaved changes");
  });

  test("a property can be added, moved up with the keyboard, and models can be moved, all saved in that order", async ({ page }) => {
    await openProduct(page, SEED_PRODUCT);
    const ed = editor(page);

    // A new property: name, unit, test method and values for two of the four models.
    await ed.getByRole("button", { name: "Add property", exact: true }).click();
    const newName = ed.getByLabel("Property 8 name", { exact: true });
    await expect(newName).toBeFocused();
    await newName.fill("E2E property");
    await ed.getByLabel("E2E property – unit", { exact: true }).fill("u");
    await ed.getByLabel("E2E property – test method", { exact: true }).fill("T-1");
    await cell(page, "BX1515", "E2E property").fill("a1");
    await cell(page, "BX4040", "E2E property").fill("a4");

    // Up to the top with the keyboard alone: the button keeps focus while the row moves.
    const up = ed.getByRole("button", { name: "Move property E2E property up", exact: true });
    await up.focus();
    for (let step = 0; step < 7; step++) {
      await page.keyboard.press("Enter");
      await expect(up).toBeFocused();
    }
    await expect(ed.getByLabel("Property 1 name", { exact: true })).toHaveValue("E2E property");
    await expect(up).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Enter"); // at the top: nothing happens
    await expect(ed.getByLabel("Property 1 name", { exact: true })).toHaveValue("E2E property");

    // BX1515 one place to the right.
    await ed.getByRole("button", { name: "Move model BX1515 right", exact: true }).click();
    await expect(modelCode(page, 1)).toHaveValue("BX2020");
    await expect(modelCode(page, 2)).toHaveValue("BX1515");
    await expect(cell(page, "BX1515", "E2E property")).toHaveValue("a1"); // the values moved with it
    await saveGrid(page);

    await page.goto(SEED_PUBLIC_PATH);
    expect(await publicColumnHeaders(page)).toEqual(["BX2020", "BX1515", "BX3030", "BX4040"]);
    await expect(publicSpecTable(page).getByRole("row").nth(1).getByRole("rowheader")).toHaveText("E2E property");
    await expect(publicRow(page, "E2E property")).toHaveText(["u", "T-1", "–", "a1", "–", "a4"]);
    await expect(publicRow(page, TENSILE)).toHaveText(["kN/m", "ASTM D6637", "20 / 20", "15 / 15", "30 / 30", "40 / 40"]);

    // Revert through the editor: remove the property, move BX1515 back.
    await openProduct(page, SEED_PRODUCT);
    await ed.getByRole("button", { name: "Remove property E2E property", exact: true }).click();
    await ed.getByRole("button", { name: "Move model BX1515 left", exact: true }).click();
    await saveGrid(page);
    await page.goto(SEED_PUBLIC_PATH);
    expect(await publicColumnHeaders(page)).toEqual(SEED_MODELS);
    await expect(publicSpecTable(page).getByRole("rowheader", { name: "E2E property" })).toHaveCount(0);
  });

  test("duplicate model codes, a blank model code and a blank property name are refused, and nothing is saved", async ({ page }) => {
    await openProduct(page, SEED_PRODUCT);
    const ed = editor(page);

    // A model code that is already used (even in another case).
    await addModel(page, 5, "bx1515");
    await saveGridButton(page).click();
    await expect(editorAlert(page)).toContainText("not saved");
    await expect(editorAlert(page)).toContainText("Model 1");
    await expect(editorAlert(page)).toContainText("Model 5");
    await expect(editorAlert(page)).toContainText("BX1515");
    await expect(modelCode(page, 1)).toHaveAttribute("aria-invalid", "true");
    await expect(modelCode(page, 5)).toHaveAttribute("aria-invalid", "true");
    await expect(modelCode(page, 2)).not.toHaveAttribute("aria-invalid", "true");
    await expect(modelCode(page, 1)).toBeFocused(); // focus goes to the first problem
    await expect(editorStatus(page)).toHaveText("Unsaved changes");

    // The site did not change.
    await page.goto(SEED_PUBLIC_PATH);
    expect(await publicColumnHeaders(page)).toEqual(SEED_MODELS);

    // A blank model code and a blank property name, both reported at once.
    await openProduct(page, SEED_PRODUCT);
    await ed.getByRole("button", { name: "Add model", exact: true }).click();
    await ed.getByRole("button", { name: "Add property", exact: true }).click();
    await saveGridButton(page).click();
    await expect(editorAlert(page)).toContainText("Model 5");
    await expect(editorAlert(page)).toContainText("Enter a model code");
    await expect(editorAlert(page)).toContainText("Property 8");
    await expect(editorAlert(page)).toContainText("Enter a property name");
    await expect(modelCode(page, 5)).toHaveAttribute("aria-invalid", "true");
    await expect(ed.getByLabel("Property 8 name", { exact: true })).toHaveAttribute("aria-invalid", "true");

    // Typing in a flagged input clears its mark; the message is gone once everything is fixed.
    await modelCode(page, 5).fill("BX5050");
    await expect(modelCode(page, 5)).not.toHaveAttribute("aria-invalid", "true");
    await ed.getByLabel("Property 8 name", { exact: true }).fill("E2E property");
    await expect(editorAlert(page)).toHaveCount(0);

    await page.goto(SEED_PUBLIC_PATH);
    expect(await publicColumnHeaders(page)).toEqual(SEED_MODELS);
  });

  test("leaving with unsaved edits asks first (links and reload); saved or reverted edits do not", async ({ page }) => {
    await openProduct(page, SEED_PRODUCT);
    const beforeUnloadBlocked = () =>
      page.evaluate(() => {
        const event = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      });

    // Clean: nothing to ask.
    expect(await beforeUnloadBlocked()).toBe(false);

    await cell(page, "BX1515", TENSILE).fill("15 / 16");
    await expect(editorStatus(page)).toHaveText("Unsaved changes");
    expect(await beforeUnloadBlocked()).toBe(true);

    // A link inside the admin: Cancel keeps the page and the edit.
    const dialogs: string[] = [];
    page.once("dialog", (dialog) => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      void dialog.dismiss();
    });
    const url = page.url();
    await page.getByRole("link", { name: "Categories", exact: true }).click();
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toMatch(/^confirm: .*unsaved/i);
    expect(page.url()).toBe(url);
    await expect(cell(page, "BX1515", TENSILE)).toHaveValue("15 / 16");

    // OK leaves, and the edit was not saved.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("link", { name: "Categories", exact: true }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/categories`);
    await openProduct(page, SEED_PRODUCT);
    await expect(cell(page, "BX1515", TENSILE)).toHaveValue("15 / 15");

    // Putting the value back, or adding only a space, is no change.
    await cell(page, "BX1515", TENSILE).fill("15 / 16");
    expect(await beforeUnloadBlocked()).toBe(true);
    await cell(page, "BX1515", TENSILE).fill("15 / 15");
    await expect(editorStatus(page)).toHaveText("No unsaved changes");
    await cell(page, "BX1515", TENSILE).fill("15 / 15 ");
    await expect(editorStatus(page)).toHaveText("No unsaved changes");
    expect(await beforeUnloadBlocked()).toBe(false);
    let asked = false;
    page.once("dialog", (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await page.getByRole("link", { name: "Categories", exact: true }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/categories`);
    expect(asked).toBe(false);
  });

  test("every input and button has a name, and the editor can be used from the keyboard", async ({ page }) => {
    await openProduct(page, SEED_PRODUCT);
    const ed = editor(page);

    await expect(ed.locator("input:not([aria-label])")).toHaveCount(0);
    const unnamedButtons = await ed
      .locator("button")
      .evaluateAll((buttons) =>
        buttons.filter((b) => !(b.getAttribute("aria-label") || b.textContent || "").trim()).length,
      );
    expect(unnamedButtons).toBe(0);
    // The sentence-style labels from the brief.
    await expect(ed.getByLabel("BX1515 – Tensile strength, MD / XMD", { exact: true })).toBeVisible();
    for (const name of [
      "Move model BX2020 left",
      "Move model BX2020 right",
      "Remove model BX2020",
      "Move property Junction efficiency up",
      "Move property Junction efficiency down",
      "Remove property Junction efficiency",
      "Add model",
      "Add property",
      "Save specification table",
    ]) {
      await expect(ed.getByRole("button", { name, exact: true }), name).toBeVisible();
    }

    // Enter on "Add model" adds a column and puts the cursor in its code field.
    await ed.getByRole("button", { name: "Add model", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(modelCode(page, 5)).toBeFocused();
    await expect(editorStatus(page)).toHaveText("Unsaved changes");
    // Tab goes on to that column's own buttons, in reading order.
    await page.keyboard.press("Tab");
    await expect(ed.getByRole("button", { name: "Move model 5 left", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(ed.getByRole("button", { name: "Move model 5 right", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(ed.getByRole("button", { name: "Remove model 5", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(modelCode(page, 5)).toHaveCount(0);
    // Back to what is stored, so there is nothing unsaved.
    await expect(editorStatus(page)).toHaveText("No unsaved changes");
    // Focus lands somewhere useful, not on the page body.
    await expect(ed.getByRole("button", { name: "Add model", exact: true })).toBeFocused();
  });

  test("on a phone the page does not scroll sideways: the grid scrolls inside its own region", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openProduct(page, SEED_PRODUCT);
    await expect(editor(page)).toBeVisible();
    await expectNoHorizontalScroll(page);

    const region = editor(page).getByRole("region", { name: /scrolls sideways/ });
    await expect(region).toHaveAttribute("tabindex", "0");
    const { scrollWidth, clientWidth } = await region.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // The first column stays in view while the models scroll past.
    await region.evaluate((el) => (el.scrollLeft = 300));
    const nameInput = editor(page).getByLabel("Property 1 name", { exact: true });
    const box = await nameInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);

    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { level: 1, name: "New product" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto("/admin/products");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("the product form", () => {
  test("a new product with images, a datasheet and applications shows on the site, can be edited, and is deleted after a confirmation", async ({ page }) => {
    const name = `E2E Product ${RUN}`;
    const renamed = `E2E Product Renamed ${RUN}`;
    const slug = `e2e-product-${RUN}`;
    cleanUpProducts([name, renamed]);

    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { level: 1, name: "New product" })).toBeVisible();
    await expect(page).toHaveTitle("New product | Admin | TerraTechBharat");
    // The spec table needs the product to exist first.
    await expect(page.getByTestId("spec-grid-editor")).toHaveCount(0);
    await expect(page.getByText(/save the product first/i)).toBeVisible();

    // Every category is offered, and every application.
    const categories = await page.getByLabel("Category", { exact: true }).locator("option").allInnerTexts();
    for (const category of ["Choose a category", "Geogrid", "Geomembrane", "Geotextile", "Geocell"]) {
      expect(categories, category).toContain(category);
    }
    const applications = page.getByRole("group", { name: "Applications" }).getByRole("checkbox");
    expect(await applications.count()).toBeGreaterThanOrEqual(6);

    await field(page, "Name").fill(name);
    await field(page, "Category").selectOption({ label: "Geogrid" });
    await field(page, "Summary").fill("A product made by the admin e2e test.");
    await field(page, "Overview (Markdown)").fill("## Made by the test\n\nA paragraph with **bold** text.");
    await field(page, "Features (one per line)").fill("First feature\r\nSecond feature\n\n  Third feature  ");
    await field(page, "Sort order").fill("99");

    await page.getByRole("button", { name: "Add image" }).click();
    await page.getByLabel("Image 1", { exact: true }).setInputFiles(png("front.png"));
    await expect(page.getByText("front.png", { exact: true })).toBeVisible();
    await field(page, "Datasheet (PDF)").setInputFiles({ name: "sheet.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("sheet.pdf", { exact: true })).toBeVisible();

    await page.getByRole("checkbox", { name: "Roads and pavements", exact: true }).check();
    await page.getByRole("checkbox", { name: "Railways", exact: true }).check();
    await publishedBox(page).check();
    await saveForm(page);

    // After creating, the new product's own screen opens so its spec table can be added.
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1$/);
    await expect(page.getByRole("heading", { level: 1, name: "Edit product" })).toBeVisible();
    await expect(page.getByText(/product created/i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Specification table" })).toBeVisible();
    await expect(editor(page)).toBeVisible();
    const productUrl = page.url().split("?")[0];

    // The list shows it.
    await page.goto("/admin/products");
    await expect(rowOf(page, name)).toContainText("Geogrid");
    await expect(rowOf(page, name)).toContainText("Published");
    await expect(rowOf(page, name)).toContainText("99");
    await expect(rowOf(page, name)).toContainText(slug);

    // The public page has everything; the spec table is "being prepared" while empty.
    await page.goto(`/products/geogrid/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("A product made by the admin e2e test.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Made by the test" })).toBeVisible();
    const features = page.locator('section[aria-labelledby="features-heading"] li');
    await expect(features).toHaveText(["First feature", "Second feature", "Third feature"]);
    await expect(page.getByRole("img", { name: `${name}, photo 1 of 1` })).toBeVisible();
    const sheet = page.getByRole("link", { name: /Download datasheet/ });
    await expect(sheet).toHaveAttribute("href", /sheet\.pdf$/);
    expect(await publicStatus(page, (await sheet.getAttribute("href"))!)).toBe(200);
    const chips = page.locator('section[aria-labelledby="applications-heading"]');
    await expect(chips.getByRole("link", { name: "Roads and pavements" })).toBeVisible();
    await expect(chips.getByRole("link", { name: "Railways" })).toBeVisible();
    await expect(page.getByText(/specification table for this product is being prepared/i)).toBeVisible();

    // Its spec table is added from the same screen.
    await page.goto(productUrl);
    await expect(editorStatus(page)).toHaveText("No unsaved changes");
    await editor(page).getByRole("button", { name: "Add model", exact: true }).click();
    await modelCode(page, 1).fill("T-100");
    await editor(page).getByRole("button", { name: "Add property", exact: true }).click();
    await editor(page).getByLabel("Property 1 name", { exact: true }).fill("Strength");
    await editor(page).getByLabel("Strength – unit", { exact: true }).fill("kN/m");
    await cell(page, "T-100", "Strength").fill("12");
    await saveGrid(page);
    await page.goto(`/products/geogrid/${slug}`);
    const table = page.getByRole("table", { name: `${name} specifications` });
    await expect(table.getByRole("columnheader", { name: "T-100" })).toBeVisible();
    await expect(table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Strength" }) }).getByRole("cell").last()).toHaveText("12");

    // Edit: what was saved is shown, and a change reaches the site.
    await page.goto(productUrl);
    await expect(field(page, "Name")).toHaveValue(name);
    await expect(field(page, "URL slug")).toHaveValue(slug);
    await expect(field(page, "Category")).toHaveValue(/.+/);
    await expect(field(page, "Features (one per line)")).toHaveValue("First feature\nSecond feature\nThird feature");
    await expect(page.getByLabel("Image 1", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="images"]')).toHaveValue(/front\.png$/);
    await expect(page.locator('input[name="datasheet_path"]')).toHaveValue(/sheet\.pdf$/);
    await expect(page.getByRole("checkbox", { name: "Roads and pavements", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Railways", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Landfills and containment", exact: true })).not.toBeChecked();
    await expect(publishedBox(page)).toBeChecked();

    await field(page, "Name").fill(renamed);
    await page.getByRole("checkbox", { name: "Railways", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: "Landfills and containment", exact: true }).check();
    await saveForm(page);
    await expect(savedStatus(page)).toHaveText("Saved.");
    // The spec grid is outside the form: it is still there, untouched.
    await expect(modelCode(page, 1)).toHaveValue("T-100");

    await page.goto(`/products/geogrid/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
    await expect(chips.getByRole("link", { name: "Roads and pavements" })).toBeVisible();
    await expect(chips.getByRole("link", { name: "Landfills and containment" })).toBeVisible();
    await expect(chips.getByRole("link", { name: "Railways" })).toHaveCount(0);

    // Unpublishing takes it off the site; the spec table stays.
    await page.goto(productUrl);
    await publishedBox(page).uncheck();
    await saveForm(page);
    await expect(savedStatus(page)).toHaveText("Saved.");
    expect(await publicStatus(page, `/products/geogrid/${slug}`)).toBe(404);
    await expect(modelCode(page, 1)).toHaveValue("T-100");

    // Delete: Cancel changes nothing, "Yes, delete" removes it with its spec table and links.
    await page.getByRole("button", { name: "Delete product" }).click();
    await expect(page.getByText(`Delete ${renamed}? This cannot be undone.`)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Yes, delete" })).toHaveCount(0);
    await page.goto("/admin/products");
    await expect(rowLink(page, renamed)).toBeVisible();

    await rowLink(page, renamed).click();
    await page.getByRole("button", { name: "Delete product" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/products`);
    await expect(rowLink(page, renamed)).toHaveCount(0);
    expect(await publicStatus(page, `/products/geogrid/${slug}`)).toBe(404);
    // Its spec rows went with it (the database cascades), so the snapshot of the seed product is the only table left to check.
  });

  test("a second product with an existing slug shows the duplicate-slug message on the slug field (Review Focus 4)", async ({ page }) => {
    const name = `E2E Duplicate Product ${RUN}`;
    cleanUpProducts([name]);

    await page.goto("/admin/products/new");
    await field(page, "Name").fill(name);
    await field(page, "Category").selectOption({ label: "Geogrid" });
    await field(page, "URL slug").fill(SEED_SLUG);
    await saveForm(page);

    await expect(formAlert(page)).toHaveText(SLUG_TAKEN);
    const slugField = field(page, "URL slug");
    await expect(slugField).toHaveAttribute("aria-invalid", "true");
    await expect(slugField).toHaveAccessibleDescription(new RegExp(SLUG_TAKEN));
    await expect(slugField).toBeFocused();
    await expect(page).toHaveURL(`${BASE_URL}/admin/products/new`);
    await expect(field(page, "Name")).toHaveValue(name);

    // The slug is unique across categories: a product of another category cannot take it either.
    await field(page, "Category").selectOption({ label: "Geocell" });
    await saveForm(page);
    await expect(formAlert(page)).toHaveText(SLUG_TAKEN);

    await slugField.fill(`e2e-duplicate-product-${RUN}`);
    await saveForm(page);
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1$/);
  });

  test("a name and a category are required, and the form says so next to the fields", async ({ page }) => {
    await page.goto("/admin/products/new");
    await field(page, "Sort order").fill("abc");
    await saveForm(page);

    await expect(field(page, "Name")).toHaveAccessibleDescription(/Enter a name/);
    await expect(field(page, "Category")).toHaveAccessibleDescription(/Choose a category/);
    await expect(field(page, "Sort order")).toHaveAccessibleDescription(/Enter a whole number/);
    await expect(field(page, "Name")).toBeFocused();
    await expect(page).toHaveURL(`${BASE_URL}/admin/products/new`);
    await expect(formAlert(page)).toHaveCount(3);
  });

  test("the overview has a Markdown preview that shows text, not raw HTML", async ({ page }) => {
    await page.goto("/admin/products/new");
    const overview = field(page, "Overview (Markdown)");
    await overview.fill("## Heading two\n\nSome **bold** words and <b>raw html</b>.");

    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = page.getByRole("region", { name: "Preview of the overview" });
    await expect(preview.getByRole("heading", { name: "Heading two" })).toBeVisible();
    await expect(preview.locator("strong")).toHaveText("bold");
    await expect(preview).toContainText("<b>raw html</b>");
    await expect(preview.locator("b")).toHaveCount(0);
    await expect(overview).toBeHidden();

    await page.getByRole("button", { name: "Write", exact: true }).click();
    await expect(overview).toBeVisible();
    await expect(overview).toHaveValue(/Heading two/);
    await expect(preview).toHaveCount(0);
  });

  test("publishing with the seeded datasheet reminder still in the overview needs a second confirmation (Ruling R9)", async ({ page }) => {
    const name = `E2E Reminder Product ${RUN}`;
    const slug = `e2e-reminder-product-${RUN}`;
    cleanUpProducts([name]);

    await page.goto("/admin/products/new");
    await field(page, "Name").fill(name);
    await field(page, "Category").selectOption({ label: "Geogrid" });
    await field(page, "Overview (Markdown)").fill(`Typical product.\n\n${REMINDER}`);
    await publishedBox(page).check();

    // The confirmation is not shown until it is needed.
    const confirm = page.getByRole("checkbox", { name: /Publish anyway/ });
    await expect(confirm).toHaveCount(0);
    await saveForm(page);

    // Nothing was saved. The form explains and offers the checkbox, with focus on it.
    await expect(page).toHaveURL(`${BASE_URL}/admin/products/new`);
    await expect(confirm).toBeVisible();
    await expect(confirm).not.toBeChecked();
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await expect(formAlert(page)).toHaveCount(1);
    await expect(formAlert(page)).toContainText("datasheet");
    await expect(confirm).toHaveAccessibleDescription(/datasheet/i);
    expect(await publicStatus(page, `/products/geogrid/${slug}`)).toBe(404);
    expect(await (await page.request.get("/admin/products")).text()).not.toContain(name);

    // Ticking it lets the same form go through, and the reminder is on the live page.
    await confirm.check();
    await saveForm(page);
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}\?created=1$/);
    await page.goto(`/products/geogrid/${slug}`);
    await expect(page.getByText("Confirm against the manufacturer's datasheet before publishing.")).toBeVisible();

    // Once the line is deleted from the overview, saving as published asks nothing.
    await openProduct(page, name);
    await field(page, "Overview (Markdown)").fill("Typical product, checked against the datasheet.");
    await saveForm(page);
    await expect(savedStatus(page)).toHaveText("Saved.");
    await expect(page.getByRole("checkbox", { name: /Publish anyway/ })).toHaveCount(0);
  });

  test("an already published seed product asks before it is saved too, and saves nothing until confirmed", async ({ page }) => {
    await openProduct(page, "HDPE Geocell");
    await expect(publishedBox(page)).toBeChecked();
    await expect(field(page, "Overview (Markdown)")).toHaveValue(/Confirm against the manufacturer's datasheet before publishing/);
    await expect(page.getByRole("checkbox", { name: /Publish anyway/ })).toHaveCount(0);
    await saveForm(page);
    await expect(page.getByRole("checkbox", { name: /Publish anyway/ })).toBeVisible();
    await expect(formAlert(page)).toContainText("datasheet");
    // Nothing was saved, so no "Saved." message (and the seed product is untouched for the other specs).
    await expect(savedStatus(page)).toHaveText("");
  });
});

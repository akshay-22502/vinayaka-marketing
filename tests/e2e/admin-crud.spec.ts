import { crc32, deflateSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "../../scripts/lib/e2e-users";
import { BASE_URL, envVar, signInWithCookie } from "../support/admin-session";

// Admin CRUD for categories, applications, certifications and projects, as the signed-in admin
// (admin@e2e.test). Every test that creates or changes content puts it back through the admin
// screens before it finishes, even when an assertion fails (the afterEach below), because the
// other specs assert the seed state (for example that /certifications is a 404 while empty) and
// the whole e2e run shares one database. If a screen is too broken to clean up, the fallback
// deletes the leftovers with the service role so the other specs are not poisoned.

const RUN = Date.now().toString(36);

const SLUG_TAKEN = "This URL slug is already used";
const SLUG_EMPTY = "Enter a URL slug using letters a–z, numbers and hyphens";
const CATEGORY_HAS_PRODUCTS = "This category still has products. Move or delete them first.";

// A solid-colour PNG and a minimal PDF: real enough for Storage and the browser. The PNG is 64x64
// and not 1x1 on purpose: next/image gives the img a srcset with a sizes of 80px, and the browser
// divides the natural width by that density, so a 1x1 file reports a naturalWidth of 0 although it loaded.
function solidPng(size: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x25)]); // filter 0, then navy-ish pixels
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = solidPng(64);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

function png(name: string) {
  return { name, mimeType: "image/png", buffer: PNG };
}

function service(): SupabaseClient {
  return createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Errors in the form on the page. (Next.js adds its own role="alert" route announcer to every page.) */
function formAlert(page: Page): Locator {
  return page.locator('form [role="alert"]');
}

function savedStatus(page: Page): Locator {
  return page.locator('form [role="status"]');
}

async function save(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

const publishedBox = (page: Page) => page.getByRole("checkbox", { name: "Published", exact: true });

/** The list row link for an item. */
const rowLink = (page: Page, name: string) => page.getByRole("main").getByRole("link", { name, exact: true });

/** The table row of an item in an admin list. */
const rowOf = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });

async function openFromList(page: Page, section: string, name: string): Promise<void> {
  await page.goto(`/admin/${section}`);
  await rowLink(page, name).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${section}/[0-9a-f-]{36}$`));
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
}

async function publicStatus(page: Page, path: string): Promise<number> {
  const response = await page.request.get(path);
  return response.status();
}

/** Deletes an item through its edit screen (with the confirm step). Does nothing when it is not listed. */
async function deleteViaAdmin(page: Page, section: string, name: string): Promise<void> {
  await page.goto(`/admin/${section}`);
  if ((await rowLink(page, name).count()) === 0) return;
  await rowLink(page, name).click();
  await page.getByRole("button", { name: /^Delete /, exact: false }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(`${BASE_URL}/admin/${section}`);
  await expect(rowLink(page, name)).toHaveCount(0);
}

// Cleanup registered by each test; runs after it whether or not it passed.
type Cleanup = { run: () => Promise<void>; fallback: () => Promise<unknown> };
const cleanups: Cleanup[] = [];

/** Registers the removal of content a test creates, under any of the names it gives it. */
function cleanUpCreated(page: Page, section: string, table: string, column: string, names: string[]): void {
  cleanups.push({
    run: async () => {
      for (const name of names) await deleteViaAdmin(page, section, name);
    },
    fallback: async () => service().from(table).delete().in(column, names),
  });
}

test.beforeEach(async ({ context }) => {
  await signInWithCookie(context, E2E_ADMIN_EMAIL);
});

test.afterEach(async () => {
  const pending = cleanups.splice(0).reverse();
  let firstError: unknown;
  for (const cleanup of pending) {
    try {
      await cleanup.run();
    } catch (error) {
      firstError ??= error;
      await cleanup.fallback();
    }
  }
  if (firstError) throw firstError;
});

test.describe("who can open the screens", () => {
  test("a visitor without a session is sent to the login page", async ({ request }) => {
    for (const section of ["categories", "applications", "certifications", "projects"]) {
      for (const path of [`/admin/${section}`, `/admin/${section}/new`]) {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBeGreaterThanOrEqual(300);
        expect(response.status(), path).toBeLessThan(400);
        expect(response.headers()["location"], path).toContain("/admin/login");
      }
    }
  });
});

test.describe("categories", () => {
  test("lists the categories by sort order, with their status", async ({ page }) => {
    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();
    await expect(page).toHaveTitle("Categories | Admin | TerraTechBharat");
    await expect(page.getByRole("link", { name: "New category" })).toHaveAttribute("href", "/admin/categories/new");

    const names = await page.getByRole("main").getByRole("row").locator("a").allInnerTexts();
    const order = ["Geogrid", "Geomembrane", "Geotextile", "Geocell"].map((name) => names.indexOf(name));
    expect(order, "seed categories are listed").not.toContain(-1);
    expect(order, "by sort order").toEqual([...order].sort((a, b) => a - b));

    await expect(rowOf(page, "Geogrid")).toContainText("geogrid");
    await expect(rowOf(page, "Geogrid")).toContainText("Published");
  });

  test("a new category gets its slug from the name, shows on the site, and can be renamed and deleted", async ({ page }) => {
    const name = `E2E Mesh ${RUN}`;
    const renamed = `E2E Mesh Renamed ${RUN}`;
    const slug = `e2e-mesh-${RUN}`;
    cleanUpCreated(page, "categories", "categories", "name", [name, renamed]);

    await page.goto("/admin/categories/new");
    await expect(page.getByRole("heading", { level: 1, name: "New category" })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Intro").fill("A category made by the admin e2e test.");
    await page.getByLabel("Sort order").fill("99");
    await publishedBox(page).check();
    await save(page);

    await expect(page).toHaveURL(`${BASE_URL}/admin/categories`);
    await expect(rowLink(page, name)).toBeVisible();
    await expect(rowOf(page, name)).toContainText(slug);
    await expect(rowOf(page, name)).toContainText("Published");
    await expect(rowOf(page, name)).toContainText("99");

    // The public site sees it straight away (the save revalidated every page).
    await page.goto(`/products/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.goto("/");
    await expect(page.getByTestId("category-tile").filter({ hasText: name })).toBeVisible();

    // Rename. The slug stays.
    await openFromList(page, "categories", name);
    await expect(page.getByLabel("URL slug")).toHaveValue(slug);
    await page.getByLabel("Name", { exact: true }).fill(renamed);
    await save(page);
    await expect(savedStatus(page)).toHaveText("Saved.");
    await page.goto(`/products/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();

    // Deleting needs a confirmation; Cancel changes nothing.
    await openFromList(page, "categories", renamed);
    await page.getByRole("button", { name: "Delete category" }).click();
    await expect(page.getByText(`Delete ${renamed}?`)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Yes, delete" })).toHaveCount(0);
    expect(await publicStatus(page, `/products/${slug}`)).toBe(200);

    await page.getByRole("button", { name: "Delete category" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/categories`);
    await expect(rowLink(page, renamed)).toHaveCount(0);
    expect(await publicStatus(page, `/products/${slug}`)).toBe(404);
  });

  test("a second category with the slug geogrid shows the duplicate-slug message on the slug field (Review Focus 4)", async ({ page }) => {
    const name = `E2E Duplicate ${RUN}`;
    cleanUpCreated(page, "categories", "categories", "name", [name]);

    await page.goto("/admin/categories/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("URL slug").fill("geogrid");
    await save(page);

    await expect(formAlert(page)).toHaveText(SLUG_TAKEN);
    const slugField = page.getByLabel("URL slug");
    await expect(slugField).toHaveAttribute("aria-invalid", "true");
    await expect(slugField).toHaveAccessibleDescription(new RegExp(SLUG_TAKEN));
    await expect(slugField).toBeFocused();
    // Still on the form, and what was typed is kept.
    await expect(page).toHaveURL(`${BASE_URL}/admin/categories/new`);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);
    await expect(slugField).toHaveValue("geogrid");

    // Fixing the slug lets the same form go through.
    await slugField.fill(`e2e-duplicate-${RUN}`);
    await save(page);
    await expect(page).toHaveURL(`${BASE_URL}/admin/categories`);
    await expect(rowLink(page, name)).toBeVisible();
  });

  test("a name without Latin letters needs a typed slug", async ({ page }) => {
    const name = "भू-वस्त्र";
    cleanUpCreated(page, "categories", "categories", "name", [name]);

    await page.goto("/admin/categories/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await save(page);

    await expect(formAlert(page)).toHaveText(SLUG_EMPTY);
    await expect(page.getByLabel("URL slug")).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(`${BASE_URL}/admin/categories/new`);
  });

  test("names missing and a sort order that is not a number are reported next to their fields", async ({ page }) => {
    await page.goto("/admin/categories/new");
    await page.getByLabel("Sort order").fill("abc");
    await save(page);

    await expect(page.getByLabel("Name", { exact: true })).toHaveAccessibleDescription(/Enter a name/);
    await expect(page.getByLabel("Sort order")).toHaveAccessibleDescription(/Enter a whole number/);
    await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
    await expect(formAlert(page)).toHaveCount(2);
  });

  test("a category that still has products cannot be deleted, and says why (Ruling R13)", async ({ page }) => {
    await openFromList(page, "categories", "Geogrid");
    await page.getByRole("button", { name: "Delete category" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(formAlert(page)).toHaveText(CATEGORY_HAS_PRODUCTS);
    // Nothing was deleted.
    await page.goto("/admin/categories");
    await expect(rowLink(page, "Geogrid")).toBeVisible();
    expect(await publicStatus(page, "/products/geogrid")).toBe(200);
  });

  test("a file of the wrong type is refused next to the upload, and nothing is stored", async ({ page }) => {
    await page.goto("/admin/categories/new");
    await page.getByLabel("Image", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });

    await expect(formAlert(page)).toContainText("notes.txt");
    await expect(page.locator('input[name="image_path"]')).toHaveValue("");
  });
});

test.describe("applications", () => {
  test("unpublishing an application removes it from /applications, and publishing brings it back", async ({ page }) => {
    const name = "Railways";
    cleanups.push({
      run: async () => {
        await openFromList(page, "applications", name);
        if (!(await publishedBox(page).isChecked())) {
          await publishedBox(page).check();
          await save(page);
          await expect(savedStatus(page)).toHaveText("Saved.");
        }
      },
      fallback: async () => service().from("applications").update({ published: true }).eq("slug", "railways"),
    });

    await page.goto("/applications");
    await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toBeVisible();

    await openFromList(page, "applications", name);
    await expect(page.getByRole("heading", { level: 1, name: "Edit application" })).toBeVisible();
    await expect(publishedBox(page)).toBeChecked();
    await publishedBox(page).uncheck();
    await save(page);
    await expect(savedStatus(page)).toHaveText("Saved.");

    await page.goto("/applications");
    await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toHaveCount(0);
    expect(await publicStatus(page, "/applications/railways")).toBe(404);
    // The other applications are untouched.
    await expect(page.getByRole("main").getByRole("link", { name: "Roads and pavements", exact: true })).toBeVisible();
    await page.goto("/admin/applications");
    await expect(rowOf(page, name)).toContainText("Draft");

    await openFromList(page, "applications", name);
    await publishedBox(page).check();
    await save(page);
    await expect(savedStatus(page)).toHaveText("Saved.");
    await page.goto("/applications");
    await expect(page.getByRole("main").getByRole("link", { name, exact: true })).toBeVisible();
    expect(await publicStatus(page, "/applications/railways")).toBe(200);
  });

  test("a new application with a Markdown body shows on the site, then is deleted", async ({ page }) => {
    const name = `E2E Application ${RUN}`;
    const slug = `e2e-application-${RUN}`;
    cleanUpCreated(page, "applications", "applications", "name", [name]);

    await page.goto("/admin/applications/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Summary").fill("Short summary from the e2e test.");
    await page.getByLabel("Details (Markdown)").fill("## Hello from Markdown\n\nA paragraph.");
    await publishedBox(page).check();
    await save(page);
    await expect(page).toHaveURL(`${BASE_URL}/admin/applications`);

    await page.goto(`/applications/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Hello from Markdown" })).toBeVisible();

    await deleteViaAdmin(page, "applications", name);
    expect(await publicStatus(page, `/applications/${slug}`)).toBe(404);
  });

  test("a duplicate slug on an application shows the same message", async ({ page }) => {
    const name = `E2E Dup Application ${RUN}`;
    cleanUpCreated(page, "applications", "applications", "name", [name]);

    await page.goto("/admin/applications/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("URL slug").fill("railways");
    await save(page);

    await expect(formAlert(page)).toHaveText(SLUG_TAKEN);
    await expect(page.getByLabel("URL slug")).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("certifications", () => {
  test("a certification created with an image and a PDF appears on /certifications, and is gone after delete", async ({ page }) => {
    const name = `E2E ISO 9001 ${RUN}`;
    cleanUpCreated(page, "certifications", "certifications", "name", [name]);

    // The seed has none, so the public page is hidden.
    expect(await publicStatus(page, "/certifications")).toBe(404);

    await page.goto("/admin/certifications/new");
    await expect(page.getByRole("heading", { level: 1, name: "New certification" })).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Issuer").fill("Bureau Veritas");
    await page.getByLabel("Valid until").fill("2099-12-31");

    await page.getByLabel("Certificate image").setInputFiles(png("Seal Logo.png"));
    await expect(page.getByText("seal-logo.png", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="image_path"]')).toHaveValue(/^certifications\/[0-9a-f-]{36}-seal-logo\.png$/);
    // The preview is the uploaded file, served from the public bucket.
    await expect(page.locator('img[src*="/storage/v1/object/public/public-media/certifications/"]')).toBeVisible();

    await page.getByLabel("Certificate PDF").setInputFiles({ name: "ISO 9001.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByText("iso-9001.pdf", { exact: true })).toBeVisible();
    await expect(page.locator('input[name="file_path"]')).toHaveValue(/^certifications\/[0-9a-f-]{36}-iso-9001\.pdf$/);

    await publishedBox(page).check();
    await save(page);
    await expect(page).toHaveURL(`${BASE_URL}/admin/certifications`);
    await expect(rowLink(page, name)).toBeVisible();
    await expect(rowOf(page, name)).toContainText("Bureau Veritas");
    await expect(rowOf(page, name)).toContainText("31 December 2099");
    await expect(rowOf(page, name)).toContainText("Published");

    // On the public page, with its image and its PDF.
    await page.goto("/certifications");
    await expect(page.getByRole("heading", { level: 1, name: "Certifications" })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: name });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Bureau Veritas");
    await expect(card).toContainText("Valid until");
    const image = card.locator("img");
    await expect(image).toHaveAttribute("src", /public-media(%2F|\/)certifications(%2F|\/)[0-9a-f-]{36}-seal-logo\.png/);
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: "the image loads" })
      .toBe(true);
    const pdf = card.getByRole("link", { name: /View certificate/ });
    await expect(pdf).toHaveAttribute("href", /public-media\/certifications\/[0-9a-f-]{36}-iso-9001\.pdf$/);
    const pdfResponse = await page.request.get((await pdf.getAttribute("href"))!);
    expect(pdfResponse.status()).toBe(200);

    // Delete it: the public page is hidden again.
    await deleteViaAdmin(page, "certifications", name);
    expect(await publicStatus(page, "/certifications")).toBe(404);
  });

  test("an impossible date is reported on the date field", async ({ page }) => {
    await page.goto("/admin/certifications/new");
    await page.getByLabel("Name", { exact: true }).fill(`E2E Bad Date ${RUN}`);
    // A date input would not accept this text, so turn the field into a text box for the test.
    await page.getByLabel("Valid until").evaluate((el: HTMLInputElement) => {
      el.type = "text";
      el.value = "2027-02-30";
    });
    await save(page);
    await expect(page.getByLabel("Valid until")).toHaveAccessibleDescription(/Enter a valid date/);
  });
});

test.describe("projects", () => {
  test("a project with images and linked products shows on the site, and edits update it", async ({ page }) => {
    const title = `E2E Project ${RUN}`;
    const slug = `e2e-project-${RUN}`;
    cleanUpCreated(page, "projects", "projects", "title", [title]);

    expect(await publicStatus(page, "/projects")).toBe(404);

    await page.goto("/admin/projects/new");
    await expect(page.getByRole("heading", { level: 1, name: "New project" })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Country").selectOption("AE");
    await page.getByLabel("Location").fill("Dubai");
    await page.getByLabel("Summary").fill("A project made by the admin e2e test.");
    await page.getByLabel("Details (Markdown)").fill("The site had weak subgrade.");

    // Products: every product is offered, published or not, with its category.
    const productBoxes = page.getByRole("group", { name: "Products used" }).getByRole("checkbox");
    expect(await productBoxes.count()).toBeGreaterThanOrEqual(7);
    await expect(page.getByRole("checkbox", { name: /HDPE Geomembrane.*Geomembrane/ })).toBeVisible();
    await page.getByRole("checkbox", { name: /PP Biaxial Geogrid/ }).check();
    await page.getByRole("checkbox", { name: /HDPE Geocell/ }).check();

    // Images: add rows, upload, reorder.
    await page.getByRole("button", { name: "Add image" }).click();
    await page.getByRole("button", { name: "Add image" }).click();
    await page.getByLabel("Image 1", { exact: true }).setInputFiles(png("first.png"));
    // Exact: the status line "Uploading first.png…" contains the name too, and shows before the upload is done.
    await expect(page.getByText("first.png", { exact: true })).toBeVisible();
    await page.getByLabel("Image 2", { exact: true }).setInputFiles(png("second.png"));
    await expect(page.getByText("second.png", { exact: true })).toBeVisible();
    const imagePaths = () => page.locator('input[name="images"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
    expect(await imagePaths()).toEqual([expect.stringMatching(/first\.png$/), expect.stringMatching(/second\.png$/)]);
    await page.getByRole("button", { name: "Move image 2 up" }).click();
    expect(await imagePaths()).toEqual([expect.stringMatching(/second\.png$/), expect.stringMatching(/first\.png$/)]);
    await page.getByRole("button", { name: "Move image 1 down" }).click();
    expect(await imagePaths()).toEqual([expect.stringMatching(/first\.png$/), expect.stringMatching(/second\.png$/)]);

    await publishedBox(page).check();
    await save(page);
    await expect(page).toHaveURL(`${BASE_URL}/admin/projects`);
    await expect(rowLink(page, title)).toBeVisible();
    await expect(rowOf(page, title)).toContainText("UAE");
    await expect(rowOf(page, title)).toContainText("Published");

    // Public: list, detail with both photos and both products.
    await page.goto("/projects");
    await expect(page.getByRole("main").getByRole("heading", { level: 2, name: title })).toBeVisible();
    await page.goto(`/projects/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("img", { name: `${title}, photo 1 of 2` })).toBeVisible();
    await expect(page.getByRole("img", { name: `${title}, photo 2 of 2` })).toBeVisible();
    const used = page.locator('section[aria-labelledby="products-used-heading"]');
    await expect(used.getByRole("link", { name: /PP Biaxial Geogrid/ }).first()).toBeVisible();
    await expect(used.getByRole("link", { name: /HDPE Geocell/ }).first()).toBeVisible();

    // The edit screen shows what was saved: the same images in order, the same products ticked.
    await openFromList(page, "projects", title);
    expect(await imagePaths()).toEqual([expect.stringMatching(/first\.png$/), expect.stringMatching(/second\.png$/)]);
    await expect(page.getByRole("checkbox", { name: /PP Biaxial Geogrid/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /HDPE Geocell/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /HDPE Geomembrane/ })).not.toBeChecked();

    // Untick one product and drop the second image.
    await page.getByRole("checkbox", { name: /HDPE Geocell/ }).uncheck();
    await page.getByRole("button", { name: "Remove image 2" }).click();
    await save(page);
    await expect(savedStatus(page)).toHaveText("Saved.");

    await page.goto(`/projects/${slug}`);
    await expect(page.getByRole("img", { name: `${title}, photo 1 of 1` })).toBeVisible();
    await expect(page.getByRole("img", { name: /photo 2 of/ })).toHaveCount(0);
    await expect(used.getByRole("link", { name: /PP Biaxial Geogrid/ }).first()).toBeVisible();
    await expect(used.getByRole("link", { name: /HDPE Geocell/ })).toHaveCount(0);

    // Delete: gone from the site, and /projects is hidden again.
    await deleteViaAdmin(page, "projects", title);
    expect(await publicStatus(page, `/projects/${slug}`)).toBe(404);
    expect(await publicStatus(page, "/projects")).toBe(404);
  });

  test("a project needs a title and a country", async ({ page }) => {
    await page.goto("/admin/projects/new");
    await save(page);
    await expect(page.getByLabel("Title", { exact: true })).toHaveAccessibleDescription(/Enter a title/);
    await expect(page.getByLabel("Country")).toHaveAccessibleDescription(/Choose a country/);
    await expect(page).toHaveURL(`${BASE_URL}/admin/projects/new`);
  });
});

test.describe("on a phone", () => {
  test("the lists and forms do not scroll sideways", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const path of [
      "/admin/categories",
      "/admin/applications",
      "/admin/certifications",
      "/admin/projects",
      "/admin/categories/new",
      "/admin/applications/new",
      "/admin/certifications/new",
      "/admin/projects/new",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    }
  });
});

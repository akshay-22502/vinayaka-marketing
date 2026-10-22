import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { stubGtag } from "../support/gtag";

// The quote form (/quote and the contact page), against the seed. The server runs with
// ALLOW_DEV_FALLBACKS=true and no Turnstile keys, so real submissions pass the captcha.
//
// The API rate limit is 5 saved requests per IP hash per hour and every test here comes from one
// address, so each test deletes the rows (and attachment files) it created. Error paths use a
// mocked /api/quote so they never reach the rate limiter or the database.

const RUN = Date.now().toString(36);
const PRODUCT_PATH = "/products/geogrid/pp-biaxial-geogrid";

function service(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("The e2e env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) is not loaded.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** An address that belongs to this run, so cleanup deletes only rows these tests made. */
function buyerEmail(tag: string): string {
  return `e2e-${tag}-${RUN}@example.com`;
}

async function deleteMyQuotes(): Promise<void> {
  const db = service();
  const { data, error } = await db
    .from("quote_requests")
    .select("id, attachment_path")
    .like("email", `e2e-%-${RUN}@example.com`);
  if (error) throw new Error(`Could not list the test quotes: ${error.message}`);
  const files = (data ?? []).map((row) => row.attachment_path as string | null).filter((path): path is string => !!path);
  if (files.length > 0) await db.storage.from("quote-attachments").remove(files);
  const removed = await db.from("quote_requests").delete().like("email", `e2e-%-${RUN}@example.com`);
  if (removed.error) throw new Error(`Could not delete the test quotes: ${removed.error.message}`);
}

test.afterEach(deleteMyQuotes);

/** Fails when the page itself scrolls sideways. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
}

// Field locators ------------------------------------------------------------------------------

const field = (page: Page, label: string): Locator => page.getByLabel(label, { exact: true });
const submitButton = (page: Page): Locator => page.getByRole("button", { name: /^(Send request|Sending)/ });
const checkedProducts = (page: Page): Locator => page.locator('input[name="products"]:checked');
/** The form's own alert region (Next also has an empty one for route changes). */
const formAlert = (page: Page): Locator => page.getByRole("alert").filter({ hasText: /\S/ });

async function fillRequired(page: Page, tag: string, over: { country?: "India" | "UAE"; skip?: "email" } = {}): Promise<void> {
  await field(page, "Name").fill("Asha Verma");
  if (over.skip !== "email") await field(page, "Email").fill(buyerEmail(tag));
  await field(page, "Phone").fill("+971 50 123 4567");
  await page.getByRole("radio", { name: over.country ?? "UAE", exact: true }).check();
  await field(page, "Message").fill("Please quote for a canal lining, about 12,000 m2.");
}

/** Mocks POST /api/quote with a fixed answer; returns the list of requests seen. */
async function mockQuote(page: Page, status: number, body: unknown): Promise<{ count: number }> {
  const seen = { count: 0 };
  await page.route("**/api/quote", async (route) => {
    seen.count += 1;
    await route.fulfill({ status, json: body });
  });
  return seen;
}

test.describe("opening the form", () => {
  test("a product page's Request a quote opens /quote with that product checked", async ({ page }) => {
    await page.goto(PRODUCT_PATH);
    await page.getByRole("main").getByRole("link", { name: "Request a quote" }).click();

    await expect(page).toHaveURL(/\/quote\?product=pp-biaxial-geogrid$/);
    await expect(page.getByRole("heading", { level: 1, name: "Request a quote" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "PP Biaxial Geogrid" })).toBeChecked();
    await expect(checkedProducts(page)).toHaveCount(1);
    // The other published products are offered, unchecked.
    await expect(page.getByRole("checkbox", { name: "HDPE Geomembrane" })).not.toBeChecked();
  });

  test("an unknown product slug opens the form with nothing checked", async ({ page }) => {
    const response = await page.goto("/quote?product=does-not-exist");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Request a quote" })).toBeVisible();
    await expect(page.locator('input[name="products"]')).not.toHaveCount(0);
    await expect(checkedProducts(page)).toHaveCount(0);
  });

  test("an unpublished product's slug is not pre-selected, and the product is not offered", async ({ page }) => {
    const db = service();
    const slug = `e2e-hidden-${RUN}`;
    const category = await db.from("categories").select("id").eq("slug", "geogrid").single();
    expect(category.error).toBeNull();
    const created = await db
      .from("products")
      .insert({ slug, name: "E2E Hidden Product", category_id: category.data!.id, published: false });
    expect(created.error).toBeNull();
    try {
      await page.goto(`/quote?product=${slug}`);
      await expect(page.getByRole("heading", { level: 1, name: "Request a quote" })).toBeVisible();
      await expect(checkedProducts(page)).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: "E2E Hidden Product" })).toHaveCount(0);
    } finally {
      await db.from("products").delete().eq("slug", slug);
    }
  });

  test("several product parameters are all pre-selected, and unknown ones are ignored", async ({ page }) => {
    await page.goto("/quote?product=hdpe-geomembrane&product=nope&product=pp-biaxial-geogrid");
    await expect(checkedProducts(page)).toHaveCount(2);
    await expect(page.getByRole("checkbox", { name: "HDPE Geomembrane" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "PP Biaxial Geogrid" })).toBeChecked();
  });

  test("has a title, one h1, a labelled form and no floating quote button", async ({ page }) => {
    await page.goto("/quote");
    await expect(page).toHaveTitle("Request a quote | TerraTechBharat");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://localhost:3100/quote");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("form", { name: "Quote request" })).toBeVisible();
    await expect(page.getByTestId("quote-fab")).toHaveCount(0);
  });

  test("labels every field and marks the optional ones", async ({ page }) => {
    await page.goto("/quote");
    for (const label of ["Name", "Email", "Phone", "Message"]) {
      await expect(field(page, label)).toBeVisible();
      await expect(field(page, label)).toHaveAttribute("required");
    }
    for (const label of [
      "Company (optional)",
      "Quantity (optional)",
      "Project location (optional)",
      "Attachment (optional)",
    ]) {
      await expect(field(page, label)).toBeVisible();
      await expect(field(page, label)).not.toHaveAttribute("required");
    }
    await expect(page.getByRole("radiogroup", { name: /^Country/ }).getByRole("radio")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "Products (optional)" }).getByRole("checkbox").first()).toBeVisible();
    await expect(field(page, "Email")).toHaveAttribute("type", "email");
    await expect(field(page, "Phone")).toHaveAttribute("type", "tel");
    await expect(field(page, "Message")).toHaveAttribute("maxlength", "5000");
  });

  for (const path of ["/quote", "/contact"]) {
    test(`${path} loads and works without console errors or hydration warnings`, async ({ page }) => {
      // The analytics tag would otherwise try to reach Google, which the test machine cannot.
      await stubGtag(page);
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
      });
      await page.goto(path);
      await submitButton(page).click();
      await expect(field(page, "Name")).toBeFocused();
      await page.getByRole("checkbox").first().check();
      expect(problems).toEqual([]);
    });
  }

  test("shows no captcha when no Turnstile site key is set", async ({ page }) => {
    await page.goto("/quote");
    await expect(page.locator('script[src*="challenges.cloudflare.com"], iframe[src*="challenges.cloudflare.com"]')).toHaveCount(0);
    await expect(page.locator('[name="cf-turnstile-response"]')).toHaveCount(0);
  });
});

test.describe("sending a request", () => {
  test("a UAE request shows a thank-you naming the UAE team and is saved with country AE", async ({ page }) => {
    await page.goto("/quote?product=pp-biaxial-geogrid");
    await fillRequired(page, "uae");
    await field(page, "Company (optional)").fill("Gulf Canals LLC");
    await field(page, "Quantity (optional)").fill("12,000 m2");
    await field(page, "Project location (optional)").fill("Al Ain, UAE");
    await page.getByRole("checkbox", { name: "HDPE Geomembrane" }).check();

    await submitButton(page).click();

    const thanks = page.getByRole("heading", { level: 2, name: /Thank you.*UAE team/ });
    await expect(thanks).toBeVisible();
    await expect(thanks).toBeFocused();
    await expect(page.getByRole("main")).not.toContainText("India team");
    // The form is replaced, not left behind.
    await expect(page.getByRole("button", { name: /Send request/ })).toHaveCount(0);

    const row = await service().from("quote_requests").select("*").eq("email", buyerEmail("uae")).single();
    expect(row.error).toBeNull();
    expect(row.data).toMatchObject({
      country: "AE",
      name: "Asha Verma",
      company: "Gulf Canals LLC",
      phone: "+971 50 123 4567",
      quantity: "12,000 m2",
      project_location: "Al Ain, UAE",
      message: "Please quote for a canal lining, about 12,000 m2.",
      status: "new",
      attachment_path: null,
    });
    expect([...row.data!.products].sort()).toEqual(["hdpe-geomembrane", "pp-biaxial-geogrid"]);
  });

  test("the contact page embeds the form: an India request with an attachment is saved with the file", async ({ page }) => {
    await page.goto("/contact");
    const main = page.getByRole("main");

    // Both offices stay; the form replaces the old call-to-action card.
    await expect(main.getByRole("region", { name: "India office" })).toBeVisible();
    await expect(main.getByRole("region", { name: "UAE office" })).toBeVisible();
    await expect(main.getByRole("heading", { level: 2, name: "Request a quote" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Request a quote" })).toHaveCount(0);
    await expect(main.getByRole("form", { name: "Quote request" })).toBeVisible();
    await expect(checkedProducts(page)).toHaveCount(0);

    await fillRequired(page, "india", { country: "India" });
    await field(page, "Attachment (optional)").setInputFiles({
      name: "canal-plan.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% e2e attachment\n%%EOF\n"),
    });
    await submitButton(page).click();

    await expect(page.getByRole("heading", { level: 2, name: /Thank you.*India team/ })).toBeFocused();

    const db = service();
    const row = await db.from("quote_requests").select("country, attachment_path, products").eq("email", buyerEmail("india")).single();
    expect(row.error).toBeNull();
    expect(row.data!.country).toBe("IN");
    expect(row.data!.products).toEqual([]);
    expect(row.data!.attachment_path).toMatch(/\.pdf$/);
    const file = await db.storage.from("quote-attachments").download(row.data!.attachment_path as string);
    expect(file.error).toBeNull();
    expect(await file.data!.text()).toContain("e2e attachment");
  });
});

test.describe("checking the form before it is sent", () => {
  test("an empty email shows an inline error on that field and sends nothing", async ({ page }) => {
    let posted = 0;
    await page.route("**/api/quote", async (route) => {
      posted += 1;
      await route.abort();
    });
    await page.goto("/quote");
    await fillRequired(page, "noemail", { skip: "email" });

    await submitButton(page).click();

    const email = field(page, "Email");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toBeFocused();
    const describedBy = await email.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Enter your email address");
    // Only that field is flagged.
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(1);
    expect(posted).toBe(0);
    await expect(submitButton(page)).toBeEnabled();

    // Typing a value clears the error.
    await email.fill("asha@example.com");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveCount(0);
  });

  test("an empty form flags every required field and focuses the first", async ({ page }) => {
    await page.goto("/quote");
    await submitButton(page).click();

    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(5);
    for (const label of ["Name", "Email", "Phone", "Message"]) {
      await expect(field(page, label)).toHaveAttribute("aria-invalid", "true");
    }
    // The country choice is one group, flagged and described as a whole.
    const country = page.getByRole("radiogroup", { name: /^Country/ });
    await expect(country).toHaveAttribute("aria-invalid", "true");
    await expect(country).toHaveAttribute("aria-describedby", /.+/);
    await expect(page.getByText("Choose India or the UAE")).toBeVisible();
    await expect(field(page, "Name")).toBeFocused();
  });

  test("a country that is not chosen puts focus on the country choice", async ({ page }) => {
    await page.goto("/quote");
    await field(page, "Name").fill("Asha Verma");
    await field(page, "Email").fill("asha@example.com");
    await field(page, "Phone").fill("+971 50 123 4567");
    await field(page, "Message").fill("Please quote.");
    await submitButton(page).click();
    await expect(page.getByRole("radio", { name: "India" })).toBeFocused();
    await expect(page.getByText("Choose India or the UAE")).toBeVisible();
  });

  test("a file over 4 MB or of the wrong type is refused next to the field and never sent", async ({ page }) => {
    let posted = 0;
    await page.route("**/api/quote", async (route) => {
      posted += 1;
      await route.abort();
    });
    await page.goto("/quote");
    const attachment = field(page, "Attachment (optional)");
    const fileCount = () => attachment.evaluate((input: HTMLInputElement) => input.files?.length ?? 0);

    // The error sits under the field; its id is one of the ids in aria-describedby (the other is the hint).
    const error = page.locator('[id$="-attachment-error"]');

    await attachment.setInputFiles({ name: "huge.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
    await expect(attachment).toHaveAttribute("aria-invalid", "true");
    await expect(error).toContainText("4 MB");
    expect(await attachment.getAttribute("aria-describedby")).toContain(await error.getAttribute("id"));
    expect(await fileCount()).toBe(0);

    await attachment.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(error).toContainText("PDF, JPG, PNG or DWG");
    expect(await fileCount()).toBe(0);

    // A good file clears the error and stays chosen.
    await attachment.setInputFiles({ name: "site.png", mimeType: "image/png", buffer: Buffer.from("png") });
    await expect(attachment).not.toHaveAttribute("aria-invalid", "true");
    await expect(error).toHaveCount(0);
    expect(await fileCount()).toBe(1);
    expect(posted).toBe(0);
  });
});

test.describe("a refused attachment", () => {
  const refused = { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") };

  test("is announced in an alert when the file is chosen", async ({ page }) => {
    await page.goto("/quote");
    await field(page, "Attachment (optional)").setInputFiles(refused);
    await expect(formAlert(page)).toContainText("PDF, JPG, PNG or DWG");
  });

  test("is not dropped silently: the next send says it was not attached, and the one after sends without it", async ({ page }) => {
    const bodies: string[] = [];
    await page.route("**/api/quote", async (route) => {
      bodies.push(route.request().postData() ?? "");
      await route.fulfill({ status: 200, json: { ok: true, id: "33333333-3333-4333-8333-333333333333", team: "AE" } });
    });
    await page.goto("/quote");
    await fillRequired(page, "refused");
    await field(page, "Attachment (optional)").setInputFiles(refused);

    await submitButton(page).click();
    await expect(page.locator('[id$="-attachment-error"]')).toContainText("not attached");
    await expect(field(page, "Attachment (optional)")).toBeFocused();
    expect(bodies).toHaveLength(0);

    await submitButton(page).click();
    await expect(page.getByRole("heading", { level: 2, name: /Thank you.*UAE team/ })).toBeFocused();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toContain("notes.txt");
  });

  test("a good file chosen afterwards is sent straight away", async ({ page }) => {
    const bodies: string[] = [];
    await page.route("**/api/quote", async (route) => {
      bodies.push(route.request().postData() ?? "");
      await route.fulfill({ status: 200, json: { ok: true, id: "44444444-4444-4444-8444-444444444444", team: "AE" } });
    });
    await page.goto("/quote");
    await fillRequired(page, "replaced");
    await field(page, "Attachment (optional)").setInputFiles(refused);
    await field(page, "Attachment (optional)").setInputFiles({ name: "site.png", mimeType: "image/png", buffer: Buffer.from("png") });

    await submitButton(page).click();
    await expect(page.getByRole("heading", { level: 2, name: /Thank you.*UAE team/ })).toBeFocused();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("site.png");
  });
});

test.describe("what the server says", () => {
  test("field errors from a 400 appear next to their fields, and the first is focused", async ({ page }) => {
    const seen = await mockQuote(page, 400, {
      ok: false,
      message: "Please check the highlighted fields and try again.",
      errors: { phone: "Phone must be at least 2 characters", email: "Enter a valid email address" },
    });
    await page.goto("/quote");
    await fillRequired(page, "mock400");
    await submitButton(page).click();

    expect(seen.count).toBe(1);
    await expect(field(page, "Email")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Phone")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "Email")).toBeFocused();
    const describedBy = await field(page, "Phone").getAttribute("aria-describedby");
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Phone must be at least 2 characters");
    await expect(formAlert(page)).toContainText("Please check the highlighted fields and try again.");
    // What the visitor typed is still there, and they can try again.
    await expect(field(page, "Name")).toHaveValue("Asha Verma");
    await expect(submitButton(page)).toBeEnabled();
  });

  for (const [status, message] of [
    [403, "We could not verify that you are human. Please try again."],
    [429, "You have sent several requests in a short time. Please try again in an hour, or contact us directly."],
    [500, "Something went wrong on our side, so your request was not sent. Please try again in a moment, or contact us directly."],
  ] as const) {
    test(`a ${status} shows the server's message in an alert and keeps the form`, async ({ page }) => {
      await mockQuote(page, status, { ok: false, message });
      await page.goto("/quote");
      await fillRequired(page, `mock${status}`);
      await submitButton(page).click();

      await expect(formAlert(page)).toHaveText(message);
      await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
      await expect(field(page, "Message")).toHaveValue("Please quote for a canal lining, about 12,000 m2.");
      await expect(submitButton(page)).toBeEnabled();
    });
  }

  test("a page that is not JSON or a lost connection shows a plain message, and a retry can succeed", async ({ page }) => {
    await page.route("**/api/quote", (route) => route.fulfill({ status: 413, contentType: "text/html", body: "<h1>Too large</h1>" }));
    await page.goto("/quote");
    await fillRequired(page, "mock413");
    await submitButton(page).click();
    await expect(formAlert(page)).toContainText("too large");

    await page.unroute("**/api/quote");
    await page.route("**/api/quote", (route) => route.abort("failed"));
    await submitButton(page).click();
    await expect(formAlert(page)).toContainText("connection");
    await expect(submitButton(page)).toBeEnabled();

    await page.unroute("**/api/quote");
    await mockQuote(page, 200, { ok: true, id: "11111111-1111-4111-8111-111111111111", team: "AE" });
    await submitButton(page).click();
    await expect(page.getByRole("heading", { level: 2, name: /Thank you.*UAE team/ })).toBeFocused();
  });

  test("the button is disabled and busy while the request is in flight, and one click sends one request", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let posted = 0;
    await page.route("**/api/quote", async (route) => {
      posted += 1;
      await gate;
      await route.fulfill({ status: 200, json: { ok: true, id: "22222222-2222-4222-8222-222222222222", team: "IN" } });
    });
    await page.goto("/quote");
    await fillRequired(page, "slow", { country: "India" });
    await submitButton(page).click();

    const button = page.getByRole("button", { name: /Sending/ });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await field(page, "Name").press("Enter");
    release();

    await expect(page.getByRole("heading", { level: 2, name: /Thank you.*India team/ })).toBeFocused();
    expect(posted).toBe(1);
  });
});

test.describe("at 375px wide", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of ["/quote", "/quote?product=pp-biaxial-geogrid", "/contact"]) {
    test(`${path} does not scroll sideways, with or without errors`, async ({ page }) => {
      expect((await page.goto(path))?.status()).toBe(200);
      await expectNoHorizontalScroll(page);

      await submitButton(page).click();
      await expect(page.locator('[aria-invalid="true"]')).toHaveCount(5);
      await expectNoHorizontalScroll(page);
    });
  }

  test("the fields are stacked in one column and easy to tap", async ({ page }) => {
    await page.goto("/quote");
    const name = await field(page, "Name").boundingBox();
    const message = await field(page, "Message").boundingBox();
    expect(name && message).toBeTruthy();
    expect(message!.y).toBeGreaterThan(name!.y);
    expect(name!.width).toBeGreaterThan(280);
    expect(name!.height).toBeGreaterThanOrEqual(44);
    const button = await submitButton(page).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
    const product = await page.getByRole("checkbox", { name: "PP Biaxial Geogrid" }).locator("xpath=ancestor::label").boundingBox();
    expect(product!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("on a desktop screen", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("contact details and project details sit side by side", async ({ page }) => {
    await page.goto("/quote");
    const name = await field(page, "Name").boundingBox();
    const quantity = await field(page, "Quantity (optional)").boundingBox();
    expect(name && quantity).toBeTruthy();
    expect(quantity!.x).toBeGreaterThan(name!.x + name!.width / 2);
    await expectNoHorizontalScroll(page);
  });
});

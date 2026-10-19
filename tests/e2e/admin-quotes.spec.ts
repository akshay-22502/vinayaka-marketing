import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_USER_EMAIL } from "../../scripts/lib/e2e-users";
import { BASE_URL, signInWithCookie, type SessionCookie } from "../support/admin-session";
import {
  PDF,
  expectNoHorizontalScroll,
  rowLink,
  rowOf,
  saveForm,
  savedStatus,
  service,
  withTimeout,
} from "../support/admin-e2e";

// The quote inbox (/admin/quotes) and Settings (/admin/settings), as the signed-in admin
// (admin@e2e.test).
//
// Quotes are submitted through the real form or /api/quote (the server runs with
// ALLOW_DEV_FALLBACKS=true and no Turnstile keys, so the captcha passes and the dev mailer counts as
// sent). The API allows 5 saved requests per IP hash per hour and every test here comes from one
// address, so each test deletes the rows (and attachment files) it created. Tests that need many
// rows (filters, paging) insert them with the service role, which carries no ip hash.
//
// Ruling R10: settings changes (the recipients, the office details) are put back after every test,
// even when an assertion failed, through the Settings screen itself (that also refreshes the public
// pages the other specs read). If the screen cannot do it, the snapshot taken before the first test
// is written back with the service role. Every cleanup step has an explicit timeout.

const RUN = Date.now().toString(36);
const CLEANUP_STEP_MS = 10_000;
const CLEANUP_TOTAL_MS = 45_000;
// Playwright gives all the afterEach work together one slot of max(test timeout, project timeout),
// 30 s by default. The cleanup below can take 10 + 10 + 45 + 10 + 45 = 120 s before it gives up, so
// the file's timeout must be larger than that or a slow failed revert never reaches the
// service-role fallback.
test.describe.configure({ timeout: 150_000 });
const PHONE_MESSAGE = "Enter a phone number with 5 to 20 digits, using digits, spaces, + - and ( ) only";
const EMAIL_MESSAGE = "Enter a valid email address";
const RECIPIENT_MESSAGE = "Enter one valid email address, or leave this blank to stop emails for this country";

// Buyers, quotes and the service role -----------------------------------------------------------

/** An address that belongs to this run, so cleanup deletes only rows these tests made. */
const buyerEmail = (tag: string) => `e2e-aq-${tag}-${RUN}@example.com`;
const buyerName = (tag: string) => `Buyer ${tag} ${RUN}`;
const EMAIL_LIKE = `e2e-aq-%-${RUN}@example.com`;

type Country = "IN" | "AE";

async function submitQuote(
  request: APIRequestContext,
  tag: string,
  over: {
    country?: Country;
    message?: string;
    name?: string;
    company?: string;
    quantity?: string;
    projectLocation?: string;
    attachment?: { name: string; mimeType: string; buffer: Buffer };
  } = {},
): Promise<void> {
  const response = await request.post("/api/quote", {
    multipart: {
      name: over.name ?? buyerName(tag),
      company: over.company ?? `Company ${tag}`,
      email: buyerEmail(tag),
      phone: "+971 50 123 4567",
      country: over.country ?? "AE",
      message: over.message ?? "Please quote for a canal lining, about 12,000 m2.",
      ...(over.quantity ? { quantity: over.quantity } : {}),
      ...(over.projectLocation ? { projectLocation: over.projectLocation } : {}),
      "cf-turnstile-response": "dev",
      ...(over.attachment ? { attachment: over.attachment } : {}),
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

type QuoteRow = {
  tag: string;
  status?: "new" | "contacted" | "quoted" | "closed";
  country?: Country;
  createdAt?: string;
  name?: string;
  company?: string | null;
  message?: string;
  email?: string;
};

/** Inserts quotes with the service role (no ip hash, so they never count against the API's rate limit). */
async function insertQuotes(rows: QuoteRow[]): Promise<void> {
  const { error } = await service()
    .from("quote_requests")
    .insert(
      rows.map((row) => ({
        name: row.name ?? buyerName(row.tag),
        company: row.company === undefined ? `Company ${row.tag}` : row.company,
        email: row.email ?? buyerEmail(row.tag),
        phone: "+91 98765 43210",
        country: row.country ?? "IN",
        message: row.message ?? "Please quote.",
        status: row.status ?? "new",
        ...(row.createdAt ? { created_at: row.createdAt } : {}),
      })),
    );
  expect(error, "insert test quotes").toBeNull();
}

async function myQuote(tag: string): Promise<{ id: string; attachment_path: string | null; email_sent: boolean; status: string }> {
  const { data, error } = await service()
    .from("quote_requests")
    .select("id, attachment_path, email_sent, status")
    .eq("email", buyerEmail(tag))
    .single();
  if (error) throw new Error(`Could not read the test quote ${tag}: ${error.message}`);
  return data;
}

async function deleteMyQuotes(): Promise<void> {
  const db = service();
  const { data, error } = await db.from("quote_requests").select("id, attachment_path").like("email", EMAIL_LIKE);
  if (error) throw new Error(`Could not list the test quotes: ${error.message}`);
  const files = (data ?? []).map((row) => row.attachment_path as string | null).filter((path): path is string => !!path);
  if (files.length > 0) await db.storage.from("quote-attachments").remove(files);
  const removed = await db.from("quote_requests").delete().like("email", EMAIL_LIKE);
  if (removed.error) throw new Error(`Could not delete the test quotes: ${removed.error.message}`);
}

// Settings snapshot and revert (R10) ---------------------------------------------------------------

const SETTINGS_LABELS: Record<string, string> = {
  tagline: "Tagline",
  hero_title: "Home page title",
  hero_text: "Home page text",
  about_md: "About page text",
  india_address: "India address",
  india_phone: "India phone",
  india_whatsapp: "India WhatsApp",
  india_email: "India public email",
  uae_address: "UAE address",
  uae_phone: "UAE phone",
  uae_whatsapp: "UAE WhatsApp",
  uae_email: "UAE public email",
};
const RECIPIENT_LABELS: Record<Country, string> = { IN: "India quote recipient", AE: "UAE quote recipient" };

type SettingsState = { site: Record<string, string>; recipients: Record<Country, string | null> };

async function readSettingsState(client: SupabaseClient): Promise<SettingsState> {
  const site = await client.from("site_settings").select(Object.keys(SETTINGS_LABELS).join(", ")).eq("id", 1).single();
  const recipients = await client.from("quote_recipients").select("country, email");
  if (site.error || recipients.error) throw new Error("Could not read the settings with the service role");
  const byCountry: SettingsState["recipients"] = { IN: null, AE: null };
  for (const row of recipients.data) byCountry[row.country as Country] = row.email as string;
  return { site: site.data as unknown as Record<string, string>, recipients: byCountry };
}

let originalSettings: SettingsState;

/** Puts the snapshot back through the Settings screen (which also refreshes the public pages). */
async function revertSettingsViaAdmin(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  page.setDefaultTimeout(CLEANUP_STEP_MS);
  try {
    await page.goto("/admin/settings", { timeout: CLEANUP_STEP_MS });
    for (const [column, label] of Object.entries(SETTINGS_LABELS)) {
      await page.getByLabel(label, { exact: true }).fill(originalSettings.site[column] ?? "", { timeout: CLEANUP_STEP_MS });
    }
    for (const country of ["IN", "AE"] as const) {
      await page.getByLabel(RECIPIENT_LABELS[country], { exact: true }).fill(originalSettings.recipients[country] ?? "", { timeout: CLEANUP_STEP_MS });
    }
    await saveForm(page);
    await expect(savedStatus(page)).toHaveText("Saved.", { timeout: CLEANUP_STEP_MS });
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** The fallback: writes the snapshot with the service role, then saves the screen unchanged so the public pages refresh. */
async function restoreSettingsDirectly(context: BrowserContext): Promise<void> {
  const client = service();
  const site = await client.from("site_settings").update(originalSettings.site).eq("id", 1);
  const removed = await client.from("quote_recipients").delete().in("country", ["IN", "AE"]);
  const wanted = (["IN", "AE"] as const).flatMap((country) =>
    originalSettings.recipients[country] ? [{ country, email: originalSettings.recipients[country] }] : [],
  );
  const added = wanted.length > 0 ? await client.from("quote_recipients").insert(wanted) : { error: null };
  const failed = [site.error, removed.error, added.error].find(Boolean);
  if (failed) throw new Error(`Could not restore the settings: ${failed.message}`);

  const page = await context.newPage();
  page.setDefaultTimeout(CLEANUP_STEP_MS);
  try {
    await page.goto("/admin/settings", { timeout: CLEANUP_STEP_MS });
    await saveForm(page);
    await expect(savedStatus(page)).toHaveText("Saved.", { timeout: CLEANUP_STEP_MS });
  } finally {
    await page.close().catch(() => undefined);
  }
}

// Session: one sign-in for the whole file (Supabase limits sign-ins per IP) ----------------------------

let adminCookies: SessionCookie[];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL });
  try {
    adminCookies = await signInWithCookie(context, E2E_ADMIN_EMAIL);
  } finally {
    await context.close();
  }
  originalSettings = await readSettingsState(service());
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(adminCookies.map(({ name, value }) => ({ name, value, url: BASE_URL })));
});

test.afterEach(async ({ context }) => {
  let firstError: unknown;
  const remember = (error: unknown) => {
    firstError ??= error;
  };

  try {
    await withTimeout(deleteMyQuotes(), CLEANUP_STEP_MS, "deleting the test quotes");
  } catch (error) {
    remember(error);
  }

  // The settings must be exactly as they were, whatever the test did.
  try {
    const now = await withTimeout(readSettingsState(service()), CLEANUP_STEP_MS, "reading the settings");
    if (JSON.stringify(now) !== JSON.stringify(originalSettings)) {
      try {
        await withTimeout(revertSettingsViaAdmin(context), CLEANUP_TOTAL_MS, "settings revert");
      } catch (error) {
        remember(error);
      }
      const after = await withTimeout(readSettingsState(service()), CLEANUP_STEP_MS, "reading the settings again");
      if (JSON.stringify(after) !== JSON.stringify(originalSettings)) {
        remember(new Error("The settings were left changed; they were restored from the snapshot"));
        await withTimeout(restoreSettingsDirectly(context), CLEANUP_TOTAL_MS, "direct settings restore");
      }
    }
  } catch (error) {
    remember(error);
  }

  if (firstError) throw firstError;
});

// Locators -----------------------------------------------------------------------------------------

const field = (page: Page, label: string): Locator => page.getByLabel(label, { exact: true });
/** The Settings screen's alert for a field, or for the whole form. (Next adds its own role="alert" announcer.) */
const formAlerts = (page: Page): Locator => page.locator('form [role="alert"]');
const recipientWarning = (page: Page): Locator => page.getByRole("region", { name: /No quote recipient set/ });
const statusSelect = (page: Page): Locator => field(page, "Status");
const notesBox = (page: Page): Locator => field(page, "Admin notes");
const NOT_SENT = "Email not sent";

async function openQuote(page: Page, name: string): Promise<void> {
  await page.goto("/admin/quotes");
  await rowLink(page, name).click();
  await expect(page).toHaveURL(/\/admin\/quotes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
}

/**
 * Saves the form on the page and waits until the server has answered. ("Saved." stays on screen
 * from an earlier save, so the message alone cannot tell this save is done.)
 */
async function saveAndWait(page: Page): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.request().method() === "POST"),
    saveForm(page),
  ]);
  expect(response.ok(), "the save request succeeded").toBe(true);
  await expect(savedStatus(page)).toHaveText("Saved.");
}

/** The filter links of the inbox: a group per filter, each link marked aria-current when it is the active one. */
const filterLink = (page: Page, group: "status" | "country", label: string): Locator =>
  page.getByRole("group", { name: group === "status" ? "Filter by status" : "Filter by country" }).getByRole("link", { name: label, exact: true });

async function expectFilters(page: Page, status: string, country: string): Promise<void> {
  await expect(filterLink(page, "status", status)).toHaveAttribute("aria-current", "true");
  await expect(filterLink(page, "country", country)).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[aria-current="true"]')).toHaveCount(2);
}

// ------------------------------------------------------------------------------------------------

test.describe("who can open the screens", () => {
  test("a visitor without a session is sent to the login page", async ({ request }) => {
    for (const path of ["/admin/quotes", "/admin/quotes?status=new", `/admin/quotes/${randomUUID()}`, "/admin/settings"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeGreaterThanOrEqual(300);
      expect(response.status(), path).toBeLessThan(400);
      expect(response.headers()["location"], path).toContain("/admin/login");
    }
  });

  test("a signed-in user who is not an admin is turned away from both screens", async ({ browser }) => {
    for (const path of ["/admin/quotes", "/admin/settings"]) {
      const context = await browser.newContext({ baseURL: BASE_URL });
      try {
        await signInWithCookie(context, E2E_USER_EMAIL);
        const page = await context.newPage();
        await page.goto(path);
        await expect(page).toHaveURL(`${BASE_URL}/admin/login?error=not-admin`);
        await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
      } finally {
        await context.close();
      }
    }
  });

  test("an id that is not a quote request is a 404 for an admin", async ({ page }) => {
    expect((await page.goto("/admin/quotes/not-an-id"))?.status()).toBe(404);
    expect((await page.goto(`/admin/quotes/${randomUUID()}`))?.status()).toBe(404);
  });

  test("the sidebar links to both screens", async ({ page }) => {
    await page.goto("/admin/quotes");
    await expect(page.getByRole("heading", { level: 1, name: "Quote requests" })).toBeVisible();
    await page.getByRole("link", { name: "Settings", exact: true }).first().click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/settings`);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  });
});

test.describe("the inbox", () => {
  test("once the UAE recipient is set in Settings, a UAE quote shows in the inbox without the 'Email not sent' badge", async ({
    page,
  }) => {
    const name = buyerName("uae");
    await page.goto("/admin/settings");
    await field(page, RECIPIENT_LABELS.AE).fill(`uae-quotes-${RUN}@example.com`);
    await saveAndWait(page);

    // A buyer sends a request through the real form.
    await page.goto("/quote?product=pp-biaxial-geogrid");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Company (optional)", { exact: true }).fill("Gulf Canals LLC");
    await page.getByLabel("Email", { exact: true }).fill(buyerEmail("uae"));
    await page.getByLabel("Phone", { exact: true }).fill("+971 50 123 4567");
    await page.getByRole("radio", { name: "UAE", exact: true }).check();
    await page.getByLabel("Message", { exact: true }).fill("Please quote for a canal lining, about 12,000 m2.");
    await page.getByRole("button", { name: /^Send request/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Thank you.*UAE team/ })).toBeVisible();

    await page.goto("/admin/quotes");
    await expect(page.getByRole("heading", { level: 1, name: "Quote requests" })).toBeVisible();
    const row = rowOf(page, name);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Gulf Canals LLC");
    await expect(row).toContainText("UAE");
    await expect(row).toContainText("PP Biaxial Geogrid");
    await expect(row).toContainText("New");
    await expect(row).toContainText(/\d{1,2} \w+ 20\d\d/);
    await expect(row).not.toContainText(NOT_SENT);
    expect((await myQuote("uae")).email_sent).toBe(true);

    // The detail page agrees.
    await rowLink(page, name).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(NOT_SENT);
  });

  test("a quote for a country with no recipient is still saved and shows 'Email not sent' in the list and on its page", async ({
    page,
  }) => {
    const name = buyerName("norecipient");
    await submitQuote(page.request, "norecipient", { country: "IN" });
    expect((await myQuote("norecipient")).email_sent).toBe(false);

    await page.goto("/admin/quotes");
    await expect(rowOf(page, name)).toContainText(NOT_SENT);
    await expect(rowOf(page, name)).toContainText("India");

    await rowLink(page, name).click();
    await expect(page.getByRole("main").getByText(NOT_SENT).first()).toBeVisible();
    // It says what to do about it.
    await expect(page.getByRole("main")).toContainText(/Settings/);
  });

  test("changing the status to Quoted, with a note, persists after a reload", async ({ page }) => {
    const name = buyerName("status");
    await submitQuote(page.request, "status");
    await page.goto("/admin");
    const newBefore = Number(await page.getByTestId("count-new-quotes").innerText());
    expect(newBefore).toBeGreaterThanOrEqual(1);

    await openQuote(page, name);
    await expect(statusSelect(page)).toHaveValue("new");
    await expect(notesBox(page)).toHaveValue("");

    await statusSelect(page).selectOption("quoted");
    await notesBox(page).fill("Sent the price list.\nFollow up on Friday.");
    await saveAndWait(page);

    await page.reload();
    await expect(statusSelect(page)).toHaveValue("quoted");
    await expect(notesBox(page)).toHaveValue("Sent the price list.\nFollow up on Friday.");
    expect((await myQuote("status")).status).toBe("quoted");

    // The dashboard counts one new request fewer (reached by a link, so the browser's own cache is in play too).
    await page.getByRole("link", { name: "Dashboard", exact: true }).first().click();
    await expect(page).toHaveURL(`${BASE_URL}/admin`);
    await expect(page.getByTestId("count-new-quotes")).toHaveText(String(newBefore - 1));

    // The list shows the new status, and the filters follow it.
    await page.goto("/admin/quotes");
    await expect(rowOf(page, name)).toContainText("Quoted");
    await page.goto("/admin/quotes?status=quoted");
    await expect(rowOf(page, name)).toBeVisible();
    await page.goto("/admin/quotes?status=new");
    await expect(rowOf(page, name)).toHaveCount(0);

    // Clearing the note and closing the request works too.
    await openQuote(page, name);
    await statusSelect(page).selectOption("closed");
    await notesBox(page).fill("");
    await saveAndWait(page);
    await page.reload();
    await expect(statusSelect(page)).toHaveValue("closed");
    await expect(notesBox(page)).toHaveValue("");
  });

  test("a note over the limit is refused next to its field and nothing is saved", async ({ page }) => {
    await submitQuote(page.request, "longnote");
    await openQuote(page, buyerName("longnote"));

    await statusSelect(page).selectOption("contacted");
    // The textarea has a maxlength, so lift it to get past the browser and test the server.
    await notesBox(page).evaluate((box: HTMLTextAreaElement) => box.removeAttribute("maxlength"));
    await notesBox(page).fill("x".repeat(5001));
    await saveForm(page);

    await expect(notesBox(page)).toHaveAttribute("aria-invalid", "true");
    await expect(formAlerts(page).filter({ hasText: /\S/ })).toHaveText("Notes must be 5000 characters or fewer");
    await expect(notesBox(page)).toBeFocused();
    expect((await myQuote("longnote")).status).toBe("new");
  });

  test("buyer text is shown as text: <b>hi</b> stays literal, and markup or script in other fields does not run", async ({ page }) => {
    const name = "<i>Mallory</i> <script>window.__pwned = 1</script>";
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await submitQuote(page.request, "xss", {
      name,
      company: "<u>Corp</u>",
      message: "<b>hi</b>",
      quantity: "<img src=x onerror=\"window.__pwned = 2\">",
      projectLocation: "<a href=\"javascript:window.__pwned = 3\">here</a>",
    });

    // The list shows the name and company as text.
    await page.goto("/admin/quotes");
    const row = rowOf(page, name);
    await expect(row).toContainText("<u>Corp</u>");
    await expect(page.getByRole("main").locator("i, u, script, b")).toHaveCount(0);

    await rowLink(page, name).click();
    const main = page.getByRole("main");
    await expect(main.getByText("<b>hi</b>", { exact: true })).toBeVisible();
    await expect(main.getByText("<u>Corp</u>", { exact: true })).toBeVisible();
    await expect(main.getByText('<img src=x onerror="window.__pwned = 2">', { exact: true })).toBeVisible();
    await expect(main.getByText('<a href="javascript:window.__pwned = 3">here</a>', { exact: true })).toBeVisible();
    // No element was made from any of it.
    await expect(main.locator("b, u, i, img[src='x'], a[href^='javascript:'], script")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    expect(dialogs).toEqual([]);

    // Notes typed by an admin are text as well.
    await notesBox(page).fill("<b>note</b>");
    await saveAndWait(page);
    await page.reload();
    await expect(notesBox(page)).toHaveValue("<b>note</b>");
    await expect(page.getByRole("main").locator("b")).toHaveCount(0);
  });

  test("the buyer's email and phone are links when they are safe, and every field is listed", async ({ page }) => {
    const name = buyerName("details");
    await submitQuote(page.request, "details", {
      country: "AE",
      quantity: "12,000 m2",
      projectLocation: "Al Ain, UAE",
      message: "Line one.\nLine two.",
    });
    await openQuote(page, name);
    const main = page.getByRole("main");

    await expect(main.getByRole("link", { name: buyerEmail("details"), exact: true })).toHaveAttribute(
      "href",
      `mailto:${buyerEmail("details")}`,
    );
    await expect(main.getByRole("link", { name: "+971 50 123 4567", exact: true })).toHaveAttribute("href", "tel:+971501234567");
    for (const text of [name, "Company details", "UAE", "12,000 m2", "Al Ain, UAE"]) {
      await expect(main.getByText(text, { exact: true }).first()).toBeVisible();
    }
    // Line breaks in the message are kept.
    const message = main.getByText("Line one.", { exact: false });
    await expect(message).toContainText("Line two.");
    expect(await message.evaluate((element) => getComputedStyle(element).whiteSpace)).toMatch(/pre/);
    await expect(main).toContainText("No attachment");
    // The buyer's ip hash is never shown.
    await expect(main).not.toContainText(/ip hash/i);
  });

  test("the attachment opens through a signed link that lasts 10 minutes, and a missing file is said to be missing", async ({
    page,
    request,
  }) => {
    const name = buyerName("file");
    await submitQuote(page.request, "file", {
      attachment: { name: "canal plan.pdf", mimeType: "application/pdf", buffer: PDF },
    });
    const stored = await myQuote("file");
    expect(stored.attachment_path).toMatch(/\.pdf$/);

    await openQuote(page, name);
    const link = page.getByRole("main").getByRole("link", { name: "canal-plan.pdf", exact: true });
    await expect(link).toBeVisible();
    const href = (await link.getAttribute("href")) ?? "";
    expect(href).toContain("/storage/v1/object/sign/quote-attachments/");

    // The link carries a token that expires in 10 minutes (600 seconds).
    const token = new URL(href).searchParams.get("token") ?? "";
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { exp: number; iat: number };
    expect(claims.exp - claims.iat).toBe(600);
    expect(claims.exp * 1000 - Date.now()).toBeGreaterThan(540_000);
    expect(claims.exp * 1000 - Date.now()).toBeLessThanOrEqual(600_000 + 5_000);
    await expect(page.getByRole("main")).toContainText("10 minutes");

    // It works without the admin's session, and downloads rather than showing the file.
    const file = await request.get(href);
    expect(file.status()).toBe(200);
    expect(await file.text()).toContain("%PDF-1.4");
    expect(file.headers()["content-disposition"]).toMatch(/attachment/i);

    // The same path without the token is refused.
    const bare = await request.get(href.split("?")[0]);
    expect(bare.status()).toBeGreaterThanOrEqual(400);

    // Take the file away: the page still opens and says it is missing.
    const removed = await service().storage.from("quote-attachments").remove([stored.attachment_path!]);
    expect(removed.error).toBeNull();
    await page.reload();
    await expect(page.getByRole("main")).toContainText("missing");
    await expect(page.getByRole("main").getByRole("link", { name: "canal-plan.pdf", exact: true })).toHaveCount(0);
    await expect(page.getByRole("main")).toContainText("canal-plan.pdf");
  });

  test("filters by status and by country, ignores unknown values, and lists the newest first", async ({ page }) => {
    // Far-future dates put these rows above anything else; they are inserted out of order on purpose.
    await insertQuotes([
      { tag: "f3", status: "quoted", country: "IN", createdAt: "2099-01-02T10:00:00Z" },
      // 22:30 UTC is already the next morning in India (04:00 IST on the 5th).
      { tag: "f1", status: "new", country: "IN", createdAt: "2099-01-04T22:30:00Z" },
      { tag: "f4", status: "closed", country: "AE", createdAt: "2099-01-01T10:00:00Z" },
      { tag: "f2", status: "contacted", country: "AE", createdAt: "2099-01-03T10:00:00Z" },
    ]);
    const names = ["f1", "f2", "f3", "f4"].map(buyerName);
    const shown = async () => {
      const found: string[] = [];
      for (const name of names) if ((await rowLink(page, name).count()) > 0) found.push(name);
      return found;
    };

    // Newest first, and the date is shown.
    await page.goto("/admin/quotes");
    const order = await page.getByRole("main").getByRole("row").locator("td:first-child a").allInnerTexts();
    expect(order.filter((text) => names.includes(text))).toEqual(names);
    await expect(rowOf(page, names[0])).toContainText("5 January 2099");
    await expect(page.getByRole("columnheader", { name: "Received (IST)" })).toBeVisible();
    await expect(rowOf(page, names[1])).toContainText("3 January 2099");

    // The request page gives the time as well, in IST.
    await rowLink(page, names[0]).click();
    await expect(page.getByRole("main")).toContainText("Received 5 January 2099, 04:00 IST");

    await page.goto("/admin/quotes?status=new");
    expect(await shown()).toEqual([names[0]]);
    await expectFilters(page, "New", "All countries");

    await page.goto("/admin/quotes?country=AE");
    expect(await shown()).toEqual([names[1], names[3]]);
    await expectFilters(page, "All statuses", "UAE");

    await page.goto("/admin/quotes?status=closed&country=AE");
    expect(await shown()).toEqual([names[3]]);
    await expectFilters(page, "Closed", "UAE");

    await page.goto("/admin/quotes?status=quoted&country=AE");
    expect(await shown()).toEqual([]);
    await expect(page.getByRole("main")).toContainText(/No quote requests match/);

    // Unknown values are ignored: everything is listed, with no error.
    const response = await page.goto("/admin/quotes?status=bogus&country=XX&page=abc");
    expect(response?.status()).toBe(200);
    expect(await shown()).toEqual(names);
    await expectFilters(page, "All statuses", "All countries");
    await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);

    // The filter links build the same addresses, and each keeps the other filter.
    await page.goto("/admin/quotes");
    await filterLink(page, "status", "Quoted").click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes?status=quoted`);
    await filterLink(page, "country", "India").click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes?status=quoted&country=IN`);
    expect(await shown()).toEqual([names[2]]);
    await expectFilters(page, "Quoted", "India");
    await filterLink(page, "status", "All statuses").click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes?country=IN`);
    expect(await shown()).toEqual([names[0], names[2]]);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes`);
    expect(await shown()).toEqual(names);
  });

  test("the dashboard's 'New quote requests' card opens the inbox filtered to new requests", async ({ page }) => {
    await insertQuotes([
      { tag: "d1", status: "new", createdAt: "2099-01-02T10:00:00Z" },
      { tag: "d2", status: "closed", createdAt: "2099-01-01T10:00:00Z" },
    ]);
    await page.goto("/admin");
    await page.getByRole("link", { name: /New quote requests/ }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes?status=new`);
    await expectFilters(page, "New", "All countries");
    await expect(rowLink(page, buyerName("d1"))).toBeVisible();
    await expect(rowLink(page, buyerName("d2"))).toHaveCount(0);
  });

  test("lists 50 requests a page, with links to the next and previous page", async ({ page }) => {
    const rows: QuoteRow[] = Array.from({ length: 52 }, (_, index) => ({
      tag: `p${String(index).padStart(2, "0")}`,
      status: "closed",
      country: "AE",
      createdAt: `2099-02-01T00:00:${String(index).padStart(2, "0")}Z`,
    }));
    await insertQuotes(rows);
    const rowsOnPage = page.getByRole("main").locator("tbody tr");

    await page.goto("/admin/quotes?status=closed");
    await expect(rowsOnPage).toHaveCount(50);
    await expect(rowsOnPage.first()).toContainText(buyerName("p51"));
    await expect(rowsOnPage.last()).toContainText(buyerName("p02"));
    const pager = page.getByRole("navigation", { name: "Pagination" });
    await expect(pager).toContainText("Page 1 of 2");
    await expect(pager.getByRole("link", { name: /Previous/ })).toHaveCount(0);

    await pager.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes?status=closed&page=2`);
    await expect(rowsOnPage).toHaveCount(2);
    await expect(rowsOnPage.first()).toContainText(buyerName("p01"));
    await expect(rowsOnPage.last()).toContainText(buyerName("p00"));
    await expect(pager).toContainText("Page 2 of 2");
    await expect(pager.getByRole("link", { name: /Next/ })).toHaveCount(0);

    await pager.getByRole("link", { name: /Previous/ }).click();
    await expect(page).toHaveURL(`${BASE_URL}/admin/quotes?status=closed`);

    // A page past the end shows the last page, not an error.
    const response = await page.goto("/admin/quotes?status=closed&page=999");
    expect(response?.status()).toBe(200);
    await expect(pager).toContainText("Page 2 of 2");
    await expect(rowsOnPage).toHaveCount(2);
  });
});

test.describe("settings", () => {
  test("editing the India phone number updates the footer", async ({ page }) => {
    // The seed leaves a [bracketed] placeholder, which shows as plain text and never as a link.
    await page.goto("/contact");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("[India phone]");
    await expect(footer.getByRole("link", { name: "[India phone]" })).toHaveCount(0);

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(field(page, "India phone")).toHaveValue("[India phone]");
    await field(page, "India phone").fill("+91 98765 43210");
    await saveAndWait(page);

    for (const path of ["/", "/contact"]) {
      await page.goto(path);
      const link = page.getByRole("contentinfo").getByRole("link", { name: "+91 98765 43210", exact: true });
      await expect(link, path).toHaveAttribute("href", "tel:+919876543210");
    }
    await expect(page.getByRole("contentinfo")).not.toContainText("[India phone]");

    // The form shows what is stored.
    await page.goto("/admin/settings");
    await expect(field(page, "India phone")).toHaveValue("+91 98765 43210");
  });

  test("saving the form without changing anything keeps the [bracketed] placeholders as plain text", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(field(page, "India phone")).toHaveValue("[India phone]");
    await expect(field(page, "UAE public email")).toHaveValue("[UAE email]");
    await saveAndWait(page);
    await expect(formAlerts(page).filter({ hasText: /\S/ })).toHaveCount(0);

    await page.goto("/contact");
    const main = page.getByRole("main");
    for (const placeholder of ["[India phone]", "[India WhatsApp]", "[India email]", "[UAE phone]", "[UAE WhatsApp]", "[UAE email]"]) {
      await expect(main.getByText(placeholder, { exact: true }), placeholder).toBeVisible();
      await expect(main.getByRole("link", { name: placeholder, exact: true }), placeholder).toHaveCount(0);
    }
    await expect(main.locator('a[href^="tel:"], a[href^="mailto:"], a[href*="wa.me"]')).toHaveCount(0);
  });

  test("the text and office fields reach the public pages", async ({ page }) => {
    const tagline = `Tagline ${RUN}`;
    const heroTitle = `Hero title ${RUN}`;
    const heroText = `Hero text ${RUN} for the home page.`;
    await page.goto("/admin/settings");
    await field(page, "Tagline").fill(tagline);
    await field(page, "Home page title").fill(heroTitle);
    await field(page, "Home page text").fill(heroText);
    await field(page, "About page text").fill(`## About heading ${RUN}\n\nPlain paragraph with <b>no markup</b>.`);
    await field(page, "UAE address").fill("Office 12, Business Bay\nDubai");
    await field(page, "UAE phone").fill("+971 4 123 4567");
    await field(page, "UAE WhatsApp").fill("+971 50 123 4567");
    await field(page, "UAE public email").fill("dubai@terratechbharat.example");
    await saveAndWait(page);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: heroTitle, exact: true })).toBeVisible();
    await expect(page.getByText(heroText, { exact: true })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText(tagline);

    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 2, name: `About heading ${RUN}` })).toBeVisible();
    // Raw HTML in the About text is shown as text, as everywhere else on the site.
    await expect(page.getByText("<b>no markup</b>", { exact: false })).toBeVisible();
    await expect(page.getByRole("main").locator("b")).toHaveCount(0);

    await page.goto("/contact");
    const uae = page.getByRole("region", { name: "UAE office" });
    await expect(uae).toContainText("Office 12, Business Bay");
    await expect(uae.getByRole("link", { name: "+971 4 123 4567", exact: true })).toHaveAttribute("href", "tel:+97141234567");
    await expect(uae.getByRole("link", { name: "+971 50 123 4567", exact: true })).toHaveAttribute("href", "https://wa.me/971501234567");
    await expect(uae.getByRole("link", { name: "dubai@terratechbharat.example", exact: true })).toHaveAttribute(
      "href",
      "mailto:dubai@terratechbharat.example",
    );
  });

  test("a wrong phone number or email is explained next to its field and nothing is saved", async ({ page }) => {
    await page.goto("/admin/settings");
    await field(page, "Tagline").fill(`Should not be saved ${RUN}`);
    await field(page, "India phone").fill("call me");
    await field(page, "UAE public email").fill("nope");
    await field(page, "India quote recipient").fill("also nope");
    await saveForm(page);

    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(3);
    await expect(field(page, "India phone")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "India phone")).toBeFocused();
    const describedBy = await field(page, "India phone").getAttribute("aria-describedby");
    await expect(page.locator(`[id="${describedBy?.split(" ").pop()}"]`)).toHaveText(PHONE_MESSAGE);
    await expect(field(page, "UAE public email")).toHaveAttribute("aria-invalid", "true");
    await expect(field(page, "India quote recipient")).toHaveAttribute("aria-invalid", "true");
    await expect(formAlerts(page).filter({ hasText: /\S/ })).toHaveText([PHONE_MESSAGE, RECIPIENT_MESSAGE, EMAIL_MESSAGE]);
    // What was typed is still in the form, and the button works again.
    await expect(field(page, "Tagline")).toHaveValue(`Should not be saved ${RUN}`);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(savedStatus(page)).toHaveText("");

    // Nothing reached the database.
    const stored = await readSettingsState(service());
    expect(stored).toEqual(originalSettings);

    // A valid WhatsApp number needs its country code (8 to 15 digits), the others may stay blank.
    await field(page, "India phone").fill("");
    await field(page, "UAE public email").fill("");
    await field(page, "India quote recipient").fill("");
    await field(page, "India WhatsApp").fill("12345");
    await saveForm(page);
    await expect(field(page, "India WhatsApp")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(1);
  });

  test("the recipient emails are saved per country, a blank one deletes the row, and the page warns about any country without one", async ({
    page,
  }) => {
    const india = `india-quotes-${RUN}@example.com`;
    const uae = `uae-quotes-${RUN}@example.com`;

    // The seed has no recipients: the page says so, naming both countries.
    await page.goto("/admin/settings");
    await expect(recipientWarning(page)).toBeVisible();
    await expect(recipientWarning(page)).toContainText("India");
    await expect(recipientWarning(page)).toContainText("UAE");
    await expect(recipientWarning(page)).toContainText(NOT_SENT);
    await expect(field(page, RECIPIENT_LABELS.IN)).toHaveValue("");

    // Setting India's removes India from the warning.
    await field(page, RECIPIENT_LABELS.IN).fill(india);
    await saveAndWait(page);
    await expect(recipientWarning(page)).toBeVisible();
    await expect(recipientWarning(page)).toContainText("UAE");
    await expect(recipientWarning(page)).not.toContainText("India");
    expect((await readSettingsState(service())).recipients).toEqual({ IN: india, AE: null });

    // Setting both removes the warning.
    await field(page, RECIPIENT_LABELS.AE).fill(`  ${uae}  `);
    await saveAndWait(page);
    await expect(recipientWarning(page)).toHaveCount(0);
    expect((await readSettingsState(service())).recipients).toEqual({ IN: india, AE: uae });
    await page.reload();
    await expect(field(page, RECIPIENT_LABELS.IN)).toHaveValue(india);
    await expect(field(page, RECIPIENT_LABELS.AE)).toHaveValue(uae);
    await expect(recipientWarning(page)).toHaveCount(0);

    // Changing an address replaces it (the row is updated, not duplicated).
    const changed = `india-new-${RUN}@example.com`;
    await field(page, RECIPIENT_LABELS.IN).fill(changed);
    await saveAndWait(page);
    expect((await readSettingsState(service())).recipients).toEqual({ IN: changed, AE: uae });
    const rows = await service().from("quote_recipients").select("country");
    expect(rows.data).toHaveLength(2);

    // Blank deletes that country's row; the other stays.
    await field(page, RECIPIENT_LABELS.IN).fill("");
    await saveAndWait(page);
    expect((await readSettingsState(service())).recipients).toEqual({ IN: null, AE: uae });
    await expect(recipientWarning(page)).toContainText("India");
    await expect(recipientWarning(page)).not.toContainText("UAE");
  });

  test("a quote for the country whose recipient was removed is saved and flagged (R16)", async ({ page }) => {
    await page.goto("/admin/settings");
    await field(page, RECIPIENT_LABELS.IN).fill(`india-quotes-${RUN}@example.com`);
    await field(page, RECIPIENT_LABELS.AE).fill(`uae-quotes-${RUN}@example.com`);
    await saveAndWait(page);
    await submitQuote(page.request, "sent", { country: "IN" });
    expect((await myQuote("sent")).email_sent).toBe(true);

    await field(page, RECIPIENT_LABELS.IN).fill("");
    await saveAndWait(page);
    await submitQuote(page.request, "unsent", { country: "IN" });
    expect((await myQuote("unsent")).email_sent).toBe(false);

    await page.goto("/admin/quotes");
    await expect(rowOf(page, buyerName("sent"))).not.toContainText(NOT_SENT);
    await expect(rowOf(page, buyerName("unsent"))).toContainText(NOT_SENT);
  });
});

test.describe("at 375px wide", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the inbox, a quote and Settings do not scroll sideways, even with long unbroken text", async ({ page }) => {
    const longWord = "W".repeat(120);
    await insertQuotes([
      {
        tag: "mobile",
        name: `Name${longWord}`,
        company: `Company${longWord}`,
        message: `${longWord} ${longWord}`,
        email: `e2e-aq-mobile-${"m".repeat(60)}-${RUN}@example.com`,
      },
    ]);

    await page.goto("/admin/quotes");
    await expect(page.getByRole("heading", { level: 1, name: "Quote requests" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    // The table itself fits too: long words wrap instead of making it scroll inside its frame.
    const tableOverflow = await page.getByRole("table").evaluate((table) => table.parentElement!.scrollWidth - table.parentElement!.clientWidth);
    expect(tableOverflow).toBeLessThanOrEqual(0);

    await rowLink(page, `Name${longWord}`).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Name");
    await expectNoHorizontalScroll(page);
    const save = page.getByRole("button", { name: "Save", exact: true });
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await statusSelect(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expect(recipientWarning(page)).toBeVisible();
    expect((await field(page, "India phone").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

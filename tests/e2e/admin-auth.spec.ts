import { readFileSync } from "node:fs";
import path from "node:path";
import {
  combineChunks,
  createChunks,
  createServerClient,
  stringFromBase64URL,
  stringToBase64URL,
} from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_PASSWORD, E2E_USER_EMAIL } from "../../scripts/lib/e2e-users";

// Admin sign-in and session handling, against the local Supabase stack with the users that
// scripts/e2e-prepare.ts creates: admin@e2e.test (admin) and user@e2e.test (not an admin).
//
// Supabase rate-limits sign-ins per IP (30 per 5 minutes locally). Only the tests about the login
// form itself type a password; the others start from a session cookie made with the same
// @supabase/ssr code the app uses.

const BASE_URL = "http://localhost:3100";
const RUN = Date.now().toString(36);
const FIXTURE_EMAIL = `admin-auth-fixture-${RUN}@example.com`;

const NOT_ADMIN_MESSAGE = "This account does not have admin access";
const WRONG_PASSWORD_MESSAGE = "Incorrect email or password";

function envVar(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`The e2e env (${name}) is not loaded.`);
  return value;
}

function service(): SupabaseClient {
  return createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type SessionCookie = { name: string; value: string };
type StoredSession = { access_token: string; refresh_token: string; expires_at: number };

const AUTH_COOKIE = /^(sb-.+-auth-token)(\.\d+)?$/;
const VALUE_PREFIX = "base64-";

/** The session inside the (possibly chunked) Supabase auth cookie. */
async function readSession(cookies: SessionCookie[]): Promise<StoredSession> {
  const base = cookies.map((cookie) => AUTH_COOKIE.exec(cookie.name)?.[1]).find(Boolean);
  if (!base) throw new Error("There is no Supabase auth cookie.");
  const value = await combineChunks(base, (name) => cookies.find((cookie) => cookie.name === name)?.value);
  if (!value?.startsWith(VALUE_PREFIX)) throw new Error("The auth cookie is not in the base64 format.");
  return JSON.parse(stringFromBase64URL(value.slice(VALUE_PREFIX.length))) as StoredSession;
}

/** The same cookies with the access token marked as expired an hour ago (the refresh token is intact). */
async function withExpiredAccessToken(cookies: SessionCookie[]): Promise<SessionCookie[]> {
  const base = cookies.map((cookie) => AUTH_COOKIE.exec(cookie.name)?.[1]).find(Boolean)!;
  const session = { ...(await readSession(cookies)), expires_at: Math.floor(Date.now() / 1000) - 3600 };
  const value = VALUE_PREFIX + stringToBase64URL(JSON.stringify(session));
  return createChunks(base, value).map(({ name, value }) => ({ name, value }));
}

/**
 * Signs in with @supabase/ssr and puts the resulting session cookies into the browser context;
 * returns them. With `expired`, the access token in them is already out of date.
 */
async function signInWithCookie(
  context: BrowserContext,
  email: string,
  opts: { expired?: boolean } = {},
): Promise<SessionCookie[]> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(
    envVar("NEXT_PUBLIC_SUPABASE_URL"),
    envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => {
          for (const { name, value } of cookies) jar.set(name, value);
        },
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  expect(jar.size, "session cookies written").toBeGreaterThan(0);

  let cookies = [...jar].map(([name, value]) => ({ name, value }));
  if (opts.expired) cookies = await withExpiredAccessToken(cookies);
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: BASE_URL })));
  return cookies;
}

/** The error in the login form. (Next.js adds its own role="alert" route announcer to every page.) */
function formAlert(page: Page): Locator {
  return page.locator('form [role="alert"]');
}

async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function deleteFixtureQuotes(): Promise<void> {
  const { error } = await service().from("quote_requests").delete().eq("email", FIXTURE_EMAIL);
  if (error) throw new Error(`Could not delete the fixture quote: ${error.message}`);
}

test.afterEach(deleteFixtureQuotes);

test.describe("signed out", () => {
  test("/admin redirects to the login page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("a wrong password shows a generic error and stays on the login page", async ({ page }) => {
    await page.goto("/admin/login");
    await submitLogin(page, E2E_ADMIN_EMAIL, "not-the-password");

    await expect(formAlert(page)).toHaveText(WRONG_PASSWORD_MESSAGE);
    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("an unknown email gets exactly the same error as a wrong password", async ({ page }) => {
    await page.goto("/admin/login");
    await submitLogin(page, `nobody-${RUN}@e2e.test`, "whatever-password");

    await expect(formAlert(page)).toHaveText(WRONG_PASSWORD_MESSAGE);
    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
  });

  test("the login page asks search engines not to index it", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page).toHaveTitle("Sign in | Admin | TerraTechBharat");
  });

  test("the redirect from /admin carries the noindex header too", async ({ request }) => {
    const response = await request.get("/admin", { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers()["location"]).toContain("/admin/login");
    expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
  });
});

test.describe("admin sign-in", () => {
  test("an admin signs in and lands on the dashboard", async ({ page }) => {
    await page.goto("/admin/login");
    await submitLogin(page, E2E_ADMIN_EMAIL, E2E_PASSWORD);

    await expect(page).toHaveURL(`${BASE_URL}/admin`);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByText("New quote requests")).toBeVisible();
    await expect(page.getByText("Published products")).toBeVisible();
    await expect(page).toHaveTitle("Dashboard | Admin | TerraTechBharat");

    // The session is a cookie: it survives a reload.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  });

  test("a signed-in admin who opens the login page goes straight to the dashboard", async ({ page, context }) => {
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    await page.goto("/admin/login");
    await expect(page).toHaveURL(`${BASE_URL}/admin`);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  });

  test("a user who is not an admin is turned away and left signed out", async ({ page, context }) => {
    await page.goto("/admin/login");
    await submitLogin(page, E2E_USER_EMAIL, E2E_PASSWORD);

    await expect(page).toHaveURL(`${BASE_URL}/admin/login?error=not-admin`);
    await expect(formAlert(page)).toHaveText(NOT_ADMIN_MESSAGE);
    await expect(page.getByLabel("Email")).toBeVisible();

    // No session is left behind: /admin sends them back to the login page.
    const cookies = await context.cookies();
    expect(cookies.filter((cookie) => cookie.name.startsWith("sb-") && cookie.value !== "")).toEqual([]);
    await page.goto("/admin");
    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
    await expect(formAlert(page)).toHaveCount(0);
  });

  test("a leftover session of a non-admin is signed out when it opens /admin", async ({ page, context }) => {
    await signInWithCookie(context, E2E_USER_EMAIL);

    await page.goto("/admin");
    await expect(page).toHaveURL(`${BASE_URL}/admin/login?error=not-admin`);
    await expect(formAlert(page)).toHaveText(NOT_ADMIN_MESSAGE);

    // The session was ended on the server, so the same cookie no longer gets in.
    await page.goto("/admin");
    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
    await expect(formAlert(page)).toHaveCount(0);
  });
});

test.describe("session refresh", () => {
  test("an expired access token is refreshed on the way in, and the browser keeps the new one", async ({ page, context }) => {
    const stale = await readSession(await signInWithCookie(context, E2E_ADMIN_EMAIL, { expired: true }));
    expect(stale.expires_at * 1000, "the cookie starts out expired").toBeLessThan(Date.now());

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const fresh = await readSession(await context.cookies());
    expect(fresh.expires_at * 1000, "the cookie now holds a live token").toBeGreaterThan(Date.now());
    expect(fresh.access_token).not.toBe(stale.access_token);
    expect(fresh.refresh_token).not.toBe(stale.refresh_token);
  });
});

test.describe("dashboard", () => {
  test("shows the counts of new quote requests and published products", async ({ page, context }) => {
    const db = service();
    const publishedProducts = await db
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("published", true);
    expect(publishedProducts.error).toBeNull();
    const published = publishedProducts.count ?? 0;
    expect(published, "the e2e setup publishes the seed products").toBeGreaterThan(0);

    const countNew = async () => {
      const { count, error } = await db
        .from("quote_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      expect(error).toBeNull();
      return count ?? 0;
    };
    const before = await countNew();

    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    await page.goto("/admin");
    await expect(page.getByTestId("count-new-quotes")).toHaveText(String(before));
    await expect(page.getByTestId("count-published-products")).toHaveText(String(published));

    // A new request, plus one that is already handled (not counted).
    const base = { name: "Admin auth fixture", email: FIXTURE_EMAIL, phone: "+910000000000", country: "IN", message: "fixture" };
    const inserted = await db
      .from("quote_requests")
      .insert([{ ...base, status: "new" }, { ...base, status: "contacted" }]);
    expect(inserted.error).toBeNull();

    await page.reload();
    await expect(page.getByTestId("count-new-quotes")).toHaveText(String(before + 1));
    await expect(page.getByTestId("count-published-products")).toHaveText(String(published));
  });

  test("has the sidebar sections and asks search engines not to index it", async ({ page, context }) => {
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    const response = await page.goto("/admin");
    expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await expect(page.getByRole("link", { name: "TerraTechBharat Admin" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Admin" });
    const sections: Record<string, string> = {
      Dashboard: "/admin",
      Quotes: "/admin/quotes",
      Products: "/admin/products",
      Categories: "/admin/categories",
      Applications: "/admin/applications",
      Certifications: "/admin/certifications",
      Projects: "/admin/projects",
      Settings: "/admin/settings",
    };
    for (const [name, href] of Object.entries(sections)) {
      await expect(nav.getByRole("link", { name, exact: true }), name).toHaveAttribute("href", href);
    }
    await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("signing out ends the session", async ({ page, context }) => {
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Admin" }).getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
    await page.goto("/admin");
    await expect(page).toHaveURL(`${BASE_URL}/admin/login`);
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  });

  test("on a phone the sidebar collapses behind a Menu button", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    await page.goto("/admin");

    const menu = page.getByRole("button", { name: "Menu" });
    const productsLink = page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Products", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(productsLink).toBeHidden();

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(productsLink).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
  });

  test("on a desktop the sidebar is always open and has no Menu button", async ({ page, context }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Products", exact: true })).toBeVisible();
  });
});

// The middleware only runs for /admin, so the public pages keep being served from the cache
// (static / ISR) instead of being rendered for every visitor.
test.describe("public pages stay static", () => {
  const PUBLIC_PAGES = ["/", "/products", "/products/geogrid", "/products/geogrid/pp-biaxial-geogrid", "/about"];

  test("the build still prerenders them", () => {
    const manifestPath = path.join(process.cwd(), ".next", "prerender-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { routes: Record<string, unknown> };
    const prerendered = Object.keys(manifest.routes);
    for (const route of PUBLIC_PAGES) {
      expect(prerendered, route).toContain(route);
    }
    expect(prerendered.filter((route) => route.startsWith("/admin"))).toEqual([]);
  });

  test("the middleware is built to run for /admin only", () => {
    const manifestPath = path.join(process.cwd(), ".next", "server", "middleware-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      middleware: Record<string, { matchers: { originalSource: string }[] }>;
    };
    const matchers = Object.values(manifest.middleware).flatMap((entry) => entry.matchers);
    expect(matchers.map((matcher) => matcher.originalSource)).toEqual(["/admin/:path*"]);
  });

  test("they are served as cacheable, not rendered per request", async ({ request }) => {
    for (const route of PUBLIC_PAGES) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(200);
      const cacheControl = response.headers()["cache-control"] ?? "";
      expect(cacheControl, `${route} cache-control`).toMatch(/s-maxage=\d+/);
      expect(cacheControl, `${route} cache-control`).not.toMatch(/no-store|private/);
      expect(response.headers()["set-cookie"], `${route} sets no cookie`).toBeUndefined();
    }
  });

  test("the admin area is never cached", async ({ context, page }) => {
    await signInWithCookie(context, E2E_ADMIN_EMAIL);
    const response = await page.goto("/admin");
    expect(response?.headers()["cache-control"]).toMatch(/no-store|private/);
  });
});

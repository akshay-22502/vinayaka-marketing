import { crc32, deflateSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Locator, type Page } from "@playwright/test";
import { BASE_URL, envVar } from "./admin-session";

// Helpers the admin e2e specs for products share: fixtures for uploads, a service-role client for
// the cleanup fallback, and locators for the admin screens.

/** Solid-colour PNG. 64x64 and not 1x1 on purpose: see solidPng in tests/e2e/admin-crud.spec.ts. */
export function solidPng(size: number): Buffer {
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
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, 0x25)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PNG = solidPng(64);
export const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

export function png(name: string) {
  return { name, mimeType: "image/png", buffer: PNG };
}

/** The service-role client: test cleanup only, never used to make the assertions of a test. */
export function service(): SupabaseClient {
  return createClient(envVar("NEXT_PUBLIC_SUPABASE_URL"), envVar("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Errors in the form on the page. (Next.js adds its own role="alert" route announcer to every page.) */
export function formAlert(page: Page): Locator {
  return page.locator('form [role="alert"]');
}

export function savedStatus(page: Page): Locator {
  return page.locator('form [role="status"]');
}

export async function saveForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

export const publishedBox = (page: Page) => page.getByRole("checkbox", { name: "Published", exact: true });

/** The list row link for an item. */
export const rowLink = (page: Page, name: string) => page.getByRole("main").getByRole("link", { name, exact: true });

/** The table row of an item in an admin list. */
export const rowOf = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page scrolls sideways").toBeLessThanOrEqual(clientWidth);
}

export async function publicStatus(page: Page, path: string): Promise<number> {
  const response = await page.request.get(path);
  return response.status();
}

/** Deletes an item through its edit screen (with the confirm step). Does nothing when it is not listed. */
export async function deleteViaAdmin(page: Page, section: string, name: string, timeout = 15_000): Promise<void> {
  await page.goto(`/admin/${section}`, { timeout });
  if ((await rowLink(page, name).count()) === 0) return;
  await rowLink(page, name).click({ timeout });
  await page.getByRole("button", { name: /^Delete /, exact: false }).click({ timeout });
  await page.getByRole("button", { name: "Yes, delete" }).click({ timeout });
  await expect(page).toHaveURL(`${BASE_URL}/admin/${section}`, { timeout });
  await expect(rowLink(page, name)).toHaveCount(0, { timeout });
}

/** Rejects when `work` takes longer than `ms`, so a hung cleanup step cannot skip the fallback. */
export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMAGE_ACCEPT, MAX_UPLOAD_BYTES, PDF_ACCEPT } from "../../src/lib/admin/upload";
import { createUser, serviceClient, signedInClient } from "./helpers";

// public-media accepts only what the admin screens upload: PNG, JPEG, WebP and PDF, up to
// MAX_UPLOAD_BYTES. The bucket enforces it whoever writes (a hand-made request with an admin's
// token, a stray script), so an HTML or SVG file can never be served from the site's own storage
// domain. The limits live in migration 20261019000005_public_media_limits.sql and in
// src/lib/admin/upload.ts; the first test fails if the two drift apart.

const run = randomUUID().slice(0, 8);
const password = "Test-password-123";
const adminEmail = `limits-admin-${run}@example.test`;

const service = serviceClient();
let admin: SupabaseClient;
let db: pg.Client;
const uploaded: string[] = [];

beforeAll(async () => {
  await createUser(adminEmail, password, { admin: true });
  admin = await signedInClient(adminEmail, password);
  db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
});

afterAll(async () => {
  if (uploaded.length > 0) await service.storage.from("public-media").remove(uploaded);
  await db?.end();
  // The admin user is left behind like the other db tests' users (the database is reset between runs).
});

async function upload(client: SupabaseClient, name: string, body: Blob | Uint8Array, contentType: string) {
  const path = `test/${run}/${name}`;
  const result = await client.storage.from("public-media").upload(path, body, { contentType });
  if (!result.error) uploaded.push(path);
  return { path, error: result.error };
}

const small = (type: string) => new Blob(["x"], { type });

describe("public-media limits", () => {
  it("allows exactly the types and size the admin screens offer (migration and upload.ts agree)", async () => {
    const { rows } = await db.query<{ allowed_mime_types: string[]; file_size_limit: string | null }>(
      "select allowed_mime_types, file_size_limit from storage.buckets where id = 'public-media'",
    );
    const offered = [...IMAGE_ACCEPT.split(","), ...PDF_ACCEPT.split(",")].map((type) => type.trim()).sort();
    expect([...rows[0].allowed_mime_types].sort()).toEqual(offered);
    expect(offered).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    expect(Number(rows[0].file_size_limit)).toBe(MAX_UPLOAD_BYTES);
  });

  it("does not touch the quote-attachments bucket", async () => {
    const { rows } = await db.query<{ allowed_mime_types: string[]; file_size_limit: string }>(
      "select allowed_mime_types, file_size_limit from storage.buckets where id = 'quote-attachments'",
    );
    expect(rows[0].file_size_limit).toBe("4194304");
    expect([...rows[0].allowed_mime_types].sort()).toEqual(["application/pdf", "image/jpeg", "image/png", "image/vnd.dwg"]);
  });

  it.each([
    ["x.png", "image/png"],
    ["x.jpg", "image/jpeg"],
    ["x.webp", "image/webp"],
    ["x.pdf", "application/pdf"],
  ])("lets an admin upload %s (%s)", async (name, type) => {
    const { error } = await upload(admin, `ok-${name}`, small(type), type);
    expect(error).toBeNull();
  });

  it.each([
    ["page.html", "text/html"],
    ["picture.svg", "image/svg+xml"],
    ["script.js", "application/javascript"],
    ["notes.txt", "text/plain"],
    ["archive.zip", "application/zip"],
  ])("refuses an admin upload of %s (%s)", async (name, type) => {
    const { path, error } = await upload(admin, `bad-${name}`, small(type), type);
    expect(error).not.toBeNull();
    // Nothing was stored.
    const { rows } = await db.query("select 1 from storage.objects where bucket_id = 'public-media' and name = $1", [path]);
    expect(rows).toHaveLength(0);
  });

  it("applies to every writer, the service role included", async () => {
    const { error } = await upload(service, "service-svg.svg", small("image/svg+xml"), "image/svg+xml");
    expect(error).not.toBeNull();
  });

  it("refuses a file one byte over the size limit and accepts one at the limit", async () => {
    const over = await upload(admin, "over.pdf", new Uint8Array(MAX_UPLOAD_BYTES + 1), "application/pdf");
    expect(over.error).not.toBeNull();
    const exact = await upload(admin, "exact.pdf", new Uint8Array(MAX_UPLOAD_BYTES), "application/pdf");
    expect(exact.error).toBeNull();
  });
});

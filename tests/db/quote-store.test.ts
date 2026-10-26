import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseQuoteStore, type NewQuoteRequest } from "@/lib/quote/store";
import { fakeFile } from "../support/quote-form";
import { serviceClient } from "./helpers";

// The quote store against the real local database and storage, as the server uses it:
// with the service-role client.

const run = randomUUID().slice(0, 8);
const slug = (label: string) => `t8-${run}-${label}`;
const service = serviceClient();
const store = createSupabaseQuoteStore(service);

const ipHash = `t8-${run}-hash`;
const otherHash = `t8-${run}-other`;

const created: Array<{ table: string; id: string }> = [];
const uploaded: string[] = [];
let previousRecipients: Array<{ country: string; email: string }> = [];

async function insertRow(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await service.from(table).insert(row).select("id").single();
  if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
  created.push({ table, id: data.id });
  return data.id;
}

function newRequest(overrides: Partial<NewQuoteRequest> = {}): NewQuoteRequest {
  return {
    name: "Store Test Buyer",
    company: "Acme",
    email: "buyer@example.test",
    phone: "+91 90000 00000",
    country: "IN",
    products: [],
    categories: [],
    quantity: "100 rolls",
    projectLocation: "Chennai",
    message: "Please quote",
    attachmentPath: null,
    ipHash,
    ...overrides,
  };
}

const s = {
  cat: slug("cat"),
  catDraft: slug("cat-draft"),
  shown: slug("shown"),
  second: slug("second"),
  draft: slug("draft"),
  inDraftCat: slug("in-draft-cat"),
};

beforeAll(async () => {
  const before = await service.from("quote_recipients").select("country, email");
  previousRecipients = before.data ?? [];

  const cat = await insertRow("categories", { slug: s.cat, name: "T8 category", sort_order: 9801, published: true });
  const catDraft = await insertRow("categories", {
    slug: s.catDraft,
    name: "T8 draft category",
    sort_order: 9802,
    published: false,
  });
  await insertRow("products", { slug: s.shown, category_id: cat, name: "T8 Shown Product", published: true });
  await insertRow("products", { slug: s.second, category_id: cat, name: "T8 Second Product", published: true });
  await insertRow("products", { slug: s.draft, category_id: cat, name: "T8 Draft Product", published: false });
  await insertRow("products", {
    slug: s.inDraftCat,
    category_id: catDraft,
    name: "T8 Hidden By Category",
    published: true,
  });
});

afterAll(async () => {
  if (uploaded.length > 0) await service.storage.from("quote-attachments").remove(uploaded);
  for (const { table, id } of [...created].reverse()) {
    await service.from(table).delete().eq("id", id);
  }
  await service.from("quote_requests").delete().in("ip_hash", [ipHash, otherHash]);
  await service.from("quote_recipients").delete().in("country", ["IN", "AE"]);
  if (previousRecipients.length > 0) await service.from("quote_recipients").upsert(previousRecipients);
});

describe("insert", () => {
  it("saves a request with status 'new' and email_sent false, mapping every field", async () => {
    const { id } = await store.insert(
      newRequest({ products: ["a-product", "another"], categories: ["geogrid"], attachmentPath: "2026-10/x-plan.pdf" }),
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const { data, error } = await service.from("quote_requests").select("*").eq("id", id).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      name: "Store Test Buyer",
      company: "Acme",
      email: "buyer@example.test",
      phone: "+91 90000 00000",
      country: "IN",
      products: ["a-product", "another"],
      categories: ["geogrid"],
      quantity: "100 rolls",
      project_location: "Chennai",
      message: "Please quote",
      attachment_path: "2026-10/x-plan.pdf",
      status: "new",
      email_sent: false,
      admin_notes: null,
      ip_hash: ipHash,
    });
  });

  it("saves optional fields as null", async () => {
    const { id } = await store.insert(
      newRequest({ company: null, quantity: null, projectLocation: null, ipHash: null }),
    );
    const { data } = await service.from("quote_requests").select("*").eq("id", id).single();
    expect(data).toMatchObject({ company: null, quantity: null, project_location: null, ip_hash: null });
    await service.from("quote_requests").delete().eq("id", id);
  });

  it("throws when the database rejects the row", async () => {
    await expect(store.insert(newRequest({ country: "US" as never }))).rejects.toThrow();
  });
});

describe("countSince", () => {
  it("counts a freshly inserted request for its ip hash, and no other", async () => {
    const before = await store.countSince(otherHash, new Date(Date.now() - 3_600_000));
    expect(before).toBe(0);

    await store.insert(newRequest({ ipHash: otherHash }));
    await store.insert(newRequest({ ipHash: otherHash }));

    const hourAgo = new Date(Date.now() - 3_600_000);
    expect(await store.countSince(otherHash, hourAgo)).toBe(2);
    expect(await store.countSince(`t8-${run}-nobody`, hourAgo)).toBe(0);
  });

  it("counts only requests newer than the cut-off", async () => {
    expect(await store.countSince(otherHash, new Date(Date.now() + 60_000))).toBe(0);

    const old = await insertRow("quote_requests", {
      name: "Old",
      email: "old@example.test",
      phone: "1234567",
      country: "IN",
      message: "old one",
      ip_hash: otherHash,
      created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    });
    const all = await store.countSince(otherHash, new Date(0));
    const recent = await store.countSince(otherHash, new Date(Date.now() - 3_600_000));
    expect(all - recent).toBe(1);
    expect(old).toBeTruthy();
  });
});

describe("markEmailSent", () => {
  it("flips email_sent for that request only", async () => {
    const a = await store.insert(newRequest());
    const b = await store.insert(newRequest());
    await store.markEmailSent(a.id);

    const rows = await service.from("quote_requests").select("id, email_sent").in("id", [a.id, b.id]);
    const byId = Object.fromEntries((rows.data ?? []).map((r) => [r.id, r.email_sent]));
    expect(byId[a.id]).toBe(true);
    expect(byId[b.id]).toBe(false);
  });
});

describe("recipientFor", () => {
  it("returns the configured address for each country, and null when there is none", async () => {
    await service.from("quote_recipients").delete().in("country", ["IN", "AE"]);
    expect(await store.recipientFor("IN")).toBeNull();

    const { error } = await service.from("quote_recipients").upsert([
      { country: "IN", email: `india-${run}@example.test` },
      { country: "AE", email: `  uae-${run}@example.test ` },
    ]);
    expect(error).toBeNull();

    expect(await store.recipientFor("IN")).toBe(`india-${run}@example.test`);
    expect(await store.recipientFor("AE")).toBe(`uae-${run}@example.test`);

    await service.from("quote_recipients").delete().eq("country", "AE");
    expect(await store.recipientFor("AE")).toBeNull();
    expect(await store.recipientFor("IN")).toBe(`india-${run}@example.test`);
  });

  it("treats a blank address as no recipient", async () => {
    await service.from("quote_recipients").upsert({ country: "AE", email: "   " });
    expect(await store.recipientFor("AE")).toBeNull();
  });
});

describe("knownProductSlugs and productNames", () => {
  it("return only published products in published categories, dropping unknown slugs", async () => {
    const asked = [s.second, "no-such-product", s.draft, s.shown, s.inDraftCat];
    expect(await store.knownProductSlugs(asked)).toEqual([s.second, s.shown]);
    expect(await store.productNames(asked)).toEqual(["T8 Second Product", "T8 Shown Product"]);
  });

  it("answer an empty list without a query", async () => {
    expect(await store.knownProductSlugs([])).toEqual([]);
    expect(await store.productNames([])).toEqual([]);
  });

  it("treat slugs that look like query syntax as unknown", async () => {
    const nasty = ['a"),slug.eq.x', "x,y", "*", "a b", "%"];
    expect(await store.knownProductSlugs([...nasty, s.shown])).toEqual([s.shown]);
  });

  it("ignore repeated slugs", async () => {
    expect(await store.knownProductSlugs([s.shown, s.shown])).toEqual([s.shown]);
  });
});

describe("listedCategories", () => {
  it("returns only published categories, in the order asked, dropping unknown, repeated and odd slugs", async () => {
    const asked = [s.catDraft, "no-such-category", s.cat, s.cat, 'a"),slug.eq.x'];
    expect(await store.listedCategories(asked)).toEqual([{ slug: s.cat, name: "T8 category" }]);
  });

  it("answers an empty list without a query", async () => {
    expect(await store.listedCategories([])).toEqual([]);
  });
});

describe("uploadAttachment", () => {
  it("stores the file at <yyyy-mm>/<uuid>-<slugified name> and returns that path", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = new File([bytes], "My Site Drawing (v2).PDF", { type: "application/pdf" });
    const path = await store.uploadAttachment(file);
    uploaded.push(path);

    const month = new Date().toISOString().slice(0, 7);
    expect(path).toMatch(new RegExp(`^${month}/[0-9a-f-]{36}-my-site-drawing-v2\\.pdf$`));

    const download = await service.storage.from("quote-attachments").download(path);
    expect(download.error).toBeNull();
    expect(new Uint8Array(await download.data!.arrayBuffer())).toEqual(bytes);
  });

  it("never writes outside the month folder, whatever the file is called", async () => {
    const path = await store.uploadAttachment(fakeFile("../../etc/passwd.png", 100, "image/png"));
    uploaded.push(path);
    expect(path).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}-[a-z0-9-]+\.png$/);
    expect(path.split("/")).toHaveLength(2);
  });

  it("copes with a name that slugifies to nothing", async () => {
    const path = await store.uploadAttachment(fakeFile("日本語.dwg", 100, "application/acad"));
    uploaded.push(path);
    expect(path).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}-file\.dwg$/);
  });

  it("gives every upload its own path, even for the same file name", async () => {
    const a = await store.uploadAttachment(fakeFile("same.pdf", 10));
    const b = await store.uploadAttachment(fakeFile("same.pdf", 10));
    uploaded.push(a, b);
    expect(a).not.toBe(b);
  });

  it("is not readable by visitors (the bucket is private)", async () => {
    const path = await store.uploadAttachment(fakeFile("private.pdf", 10));
    uploaded.push(path);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const response = await fetch(`${base}/storage/v1/object/public/quote-attachments/${path}`);
    expect(response.ok).toBe(false);
  });

  it("refuses names whose extension is an inherited Object property, without writing anything", async () => {
    for (const name of ["evil.constructor", "evil.__proto__", "evil.toString", "evil.exe", "noextension"]) {
      await expect(store.uploadAttachment(fakeFile(name, 100, "application/octet-stream")), name).rejects.toThrow(
        /not allowed/,
      );
    }
  });

  it("throws when the file is over the bucket's 4 MB limit", async () => {
    await expect(store.uploadAttachment(fakeFile("huge.pdf", 5 * 1024 * 1024))).rejects.toThrow();
  });
});

describe("the quote-attachments bucket", () => {
  const bucket = () => service.storage.from("quote-attachments");

  it("is private, limited to 4 MB and to the types the API stores", async () => {
    const { data, error } = await service.storage.getBucket("quote-attachments");
    expect(error).toBeNull();
    expect(data).toMatchObject({ public: false, file_size_limit: 4 * 1024 * 1024 });
    expect([...(data?.allowed_mime_types ?? [])].sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/png", "image/vnd.dwg"].sort(),
    );
  });

  it("accepts every type the API stores", async () => {
    for (const [file, type] of [
      ["ok.pdf", "application/pdf"],
      ["ok.jpg", "image/jpeg"],
      ["ok.png", "image/png"],
      ["ok.dwg", "image/vnd.dwg"],
    ] as const) {
      const path = `t8-${run}/${file}`;
      const { error } = await bucket().upload(path, new Blob(["x"], { type }));
      expect(error, file).toBeNull();
      uploaded.push(path);
    }
  });

  it("rejects other content types even when written directly with the service key", async () => {
    for (const type of ["text/html", "application/x-msdownload", "image/svg+xml", "application/octet-stream"]) {
      const path = `t8-${run}/bad-${type.replace(/\W/g, "-")}`;
      const { error } = await bucket().upload(path, new Blob(["x"], { type }));
      expect(error, type).not.toBeNull();
      if (!error) uploaded.push(path);
    }
  });
});

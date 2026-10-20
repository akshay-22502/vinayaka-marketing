import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashIp } from "@/lib/quote/ip";
import { fakeFile, quoteForm } from "../support/quote-form";
import { serviceClient } from "./helpers";

// End to end through the real POST handler, the real store and the real database, with
// the dev fallbacks standing in for Cloudflare and Resend.

const run = randomUUID().slice(0, 8);
const SALT = `t8-route-salt-${run}`;
const service = serviceClient();
const uploaded: string[] = [];
let previousRecipients: Array<{ country: string; email: string }> = [];
let POST: (request: Request) => Promise<Response>;

const indiaRecipient = `india-${run}@example.test`;
const uaeRecipient = `uae-${run}@example.test`;

function request(form: FormData, ip: string): Request {
  return new Request("http://localhost/api/quote", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": ip },
  });
}

async function rowsFor(ip: string) {
  const { data, error } = await service.from("quote_requests").select("*").eq("ip_hash", hashIp(ip, SALT));
  if (error) throw new Error(error.message);
  return data ?? [];
}

// The salt is unique to this run, so addresses only need to differ within it.
const usedIps: string[] = [];
function freshIp(): string {
  const ip = `198.51.100.${usedIps.length + 1}`;
  usedIps.push(ip);
  return ip;
}

beforeAll(async () => {
  vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("IP_HASH_SALT", SALT);
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  ({ POST } = await import("@/app/api/quote/route"));

  const before = await service.from("quote_recipients").select("country, email");
  previousRecipients = before.data ?? [];
  const { error } = await service.from("quote_recipients").upsert([
    { country: "IN", email: indiaRecipient },
    { country: "AE", email: uaeRecipient },
  ]);
  if (error) throw new Error(error.message);
});

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (uploaded.length > 0) await service.storage.from("quote-attachments").remove(uploaded);
  await service
    .from("quote_requests")
    .delete()
    .in(
      "ip_hash",
      usedIps.map((ip) => hashIp(ip, SALT)),
    );
  await service.from("quote_recipients").delete().in("country", ["IN", "AE"]);
  if (previousRecipients.length > 0) await service.from("quote_recipients").upsert(previousRecipients);
});

describe("POST /api/quote against the local database", () => {
  it("saves the request, emails the country's recipient (dev logger) and marks it sent", async () => {
    const ip = freshIp();
    const response = await POST(request(quoteForm({ country: "AE", products: ["no-such-product"] }), ip));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, team: "AE" });
    const rows = await rowsFor(ip);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.id,
      status: "new",
      country: "AE",
      email: "asha@verma-infra.example",
      products: [],
      email_sent: true,
    });
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).toContain(uaeRecipient);
    expect(logged).not.toContain(indiaRecipient);
  });

  it("stores an attachment in the private bucket and records its path", async () => {
    const ip = freshIp();
    const response = await POST(request(quoteForm({ attachment: fakeFile("site plan.pdf", 2048) }), ip));
    expect(response.status).toBe(200);

    const [row] = await rowsFor(ip);
    expect(row!.attachment_path).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}-site-plan\.pdf$/);
    uploaded.push(row!.attachment_path);
    const download = await service.storage.from("quote-attachments").download(row!.attachment_path);
    expect(download.error).toBeNull();
    expect(download.data!.size).toBe(2048);
  });

  it("keeps the row with email_sent false when no recipient is configured", async () => {
    await service.from("quote_recipients").delete().eq("country", "IN");
    try {
      const ip = freshIp();
      const response = await POST(request(quoteForm(), ip));
      expect(response.status).toBe(200);
      const [row] = await rowsFor(ip);
      expect(row).toMatchObject({ status: "new", email_sent: false });
    } finally {
      await service.from("quote_recipients").upsert({ country: "IN", email: indiaRecipient });
    }
  });

  it("answers the sixth request from the same address with 429 and saves nothing more", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      const ok = await POST(request(quoteForm({ message: `Request number ${i + 1}` }), ip));
      expect(ok.status).toBe(200);
    }
    const sixth = await POST(request(quoteForm({ message: "Request number 6" }), ip));
    expect(sixth.status).toBe(429);
    expect(await rowsFor(ip)).toHaveLength(5);

    const other = await POST(request(quoteForm(), freshIp()));
    expect(other.status).toBe(200);
  });

  it("rejects an attachment named like an inherited Object property, with JSON 400 and nothing saved", async () => {
    const ip = freshIp();
    for (const [name, type] of [
      ["evil.constructor", "application/octet-stream"],
      ["evil.__proto__", ""],
      ["evil.constructor", "text/html"],
    ] as const) {
      const response = await POST(request(quoteForm({ attachment: fakeFile(name, 100, type) }), ip));
      expect(response.status, name).toBe(400);
      expect((await response.json()).errors).toHaveProperty("attachment");
    }
    expect(await rowsFor(ip)).toHaveLength(0);
  });

  it("rate-limits an IPv6 visitor as a whole /64, so changing the host part does not help", async () => {
    const prefix = "2001:db8:77:";
    const ip = (n: number) => `${prefix}1:aaaa:bbbb:cccc:${n.toString(16)}`;
    usedIps.push(ip(1), `${prefix}2::1`); // so afterAll cleans up even if an assertion fails
    for (let i = 1; i <= 5; i++) {
      expect((await POST(request(quoteForm(), ip(i)))).status).toBe(200);
    }
    expect((await POST(request(quoteForm(), ip(6)))).status).toBe(429);
    // The next /64 is a different visitor.
    expect((await POST(request(quoteForm(), `${prefix}2::1`))).status).toBe(200);
  });

  it("rejects bad input with 400 and saves nothing", async () => {
    const ip = freshIp();
    const response = await POST(request(quoteForm({ email: "nope" }), ip));
    expect(response.status).toBe(400);
    expect((await response.json()).errors).toHaveProperty("email");
    expect(await rowsFor(ip)).toHaveLength(0);
  });
});

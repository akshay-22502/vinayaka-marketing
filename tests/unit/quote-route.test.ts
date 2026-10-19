import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quoteForm } from "../support/quote-form";

// The route builds its dependencies from env vars on every request, so a missing secret is a
// 500 at request time and nothing needs a secret while the module loads (`next build`).

const CONFIG = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  RESEND_API_KEY: "re_key",
  IP_HASH_SALT: "salt",
  ALLOW_DEV_FALLBACKS: "",
  VERCEL_ENV: "",
};

function request(form: FormData = new FormData(), headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/quote", { method: "POST", body: form, headers });
}

let POST: (request: Request) => Promise<Response>;

beforeEach(async () => {
  // Fresh modules each time: the service-role client is created once per module load.
  vi.resetModules();
  ({ POST } = await import("@/app/api/quote/route"));
  for (const [name, value] of Object.entries(CONFIG)) vi.stubEnv(name, value);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/quote configuration", () => {
  it("is ready to handle a request when everything is set (an empty form is a 400, not a 500)", async () => {
    const response = await POST(request());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toHaveProperty("email");
  });

  it.each(["TURNSTILE_SECRET_KEY", "RESEND_API_KEY", "IP_HASH_SALT", "SUPABASE_SERVICE_ROLE_KEY"])(
    "responds 500 with a logged error when %s is missing and fallbacks are off",
    async (name) => {
      vi.stubEnv(name, "");
      const response = await POST(request(quoteForm()));

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(JSON.stringify(body)).not.toContain(name);
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain(name);
    },
  );

  describe("with ALLOW_DEV_FALLBACKS=true and no Turnstile secret or Resend key", () => {
    beforeEach(() => {
      vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
      vi.stubEnv("TURNSTILE_SECRET_KEY", "");
      vi.stubEnv("RESEND_API_KEY", "");
    });

    it("is ready to handle a request", async () => {
      expect((await POST(request())).status).toBe(400);
    });

    it("still needs the ip hash salt", async () => {
      vi.stubEnv("IP_HASH_SALT", "");
      expect((await POST(request())).status).toBe(500);
    });

    it("still needs the service-role key", async () => {
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
      expect((await POST(request())).status).toBe(500);
    });
  });

  it("ignores the dev flag unless it is exactly 'true'", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    for (const value of ["1", "TRUE", "yes"]) {
      vi.stubEnv("ALLOW_DEV_FALLBACKS", value);
      expect((await POST(request())).status).toBe(500);
    }
  });

  it("ignores the dev flag on a Vercel production deployment", async () => {
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await POST(request())).status).toBe(500);
  });
});

describe("POST /api/quote requests", () => {
  it("rejects a body that is not a form with a 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/quote", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).ok).toBe(false);
  });

  it("rejects a request that declares a body far over the attachment limit, before reading it", async () => {
    const response = await POST(request(quoteForm(), { "content-length": String(6 * 1024 * 1024) }));
    expect(response.status).toBe(400);
    expect((await response.json()).errors).toHaveProperty("attachment");
  });

  it("sends the answer uncached, as JSON", async () => {
    const response = await POST(request());
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/quote when something unexpected throws", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/quote/handle");
  });

  it("answers with a JSON 500 instead of an unhandled error", async () => {
    vi.resetModules();
    vi.doMock("@/lib/quote/handle", () => ({
      handleQuote: async () => {
        throw new TypeError("Cannot read properties of undefined (password=hunter2)");
      },
    }));
    const { POST: guarded } = await import("@/app/api/quote/route");

    const response = await guarded(request(quoteForm()));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(typeof body.message).toBe("string");
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("hunter2");
  });
});

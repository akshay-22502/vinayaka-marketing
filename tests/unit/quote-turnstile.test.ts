import { afterEach, describe, expect, it, vi } from "vitest";
import { createCaptchaVerifier, verifyTurnstile } from "@/lib/quote/turnstile";

const URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/** A fetch that answers with `response` and records what it was asked. */
function recordingFetch(response: () => Response = () => jsonResponse({ success: true })) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init: init ?? {} });
    return response();
  };
  return { fetchImpl, requests };
}

describe("verifyTurnstile", () => {
  it("posts the secret, token and ip to Cloudflare and returns true on success", async () => {
    const { fetchImpl, requests } = recordingFetch();
    const ok = await verifyTurnstile("tok", "203.0.113.7", { secret: "sekret", fetchImpl });

    expect(ok).toBe(true);
    expect(requests).toHaveLength(1);
    const { url, init } = requests[0]!;
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("secret")).toBe("sekret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("leaves out the ip when it is unknown", async () => {
    const { fetchImpl, requests } = recordingFetch();
    await verifyTurnstile("tok", "unknown", { secret: "s", fetchImpl });
    expect(new URLSearchParams(String(requests[0]!.init.body)).has("remoteip")).toBe(false);
  });

  it("returns false when Cloudflare says the token is not valid", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false, "error-codes": ["invalid-input-response"] }));
    expect(await verifyTurnstile("bad", "1.2.3.4", { secret: "s", fetchImpl })).toBe(false);
  });

  it("returns false on a network error, a non-200 reply or an unreadable body", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyTurnstile("t", "1.2.3.4", { secret: "s", fetchImpl: down })).toBe(false);

    const serverError = vi.fn(async () => jsonResponse({ success: true }, { status: 500 }));
    expect(await verifyTurnstile("t", "1.2.3.4", { secret: "s", fetchImpl: serverError })).toBe(false);

    const garbage = vi.fn(async () => new Response("<html>nope</html>"));
    expect(await verifyTurnstile("t", "1.2.3.4", { secret: "s", fetchImpl: garbage })).toBe(false);
  });

  it("returns false without calling Cloudflare when there is no token", async () => {
    const { fetchImpl, requests } = recordingFetch();
    expect(await verifyTurnstile("", "1.2.3.4", { secret: "s", fetchImpl })).toBe(false);
    expect(await verifyTurnstile("   ", "1.2.3.4", { secret: "s", fetchImpl })).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it("only treats success: true as success", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: "yes" }));
    expect(await verifyTurnstile("t", "1.2.3.4", { secret: "s", fetchImpl })).toBe(false);
  });
});

describe("createCaptchaVerifier", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("verifies against Cloudflare with TURNSTILE_SECRET_KEY when it is set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret");
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "");
    const fetchMock = vi.fn(async () => jsonResponse({ success: false }));
    vi.stubGlobal("fetch", fetchMock);

    const verify = createCaptchaVerifier();
    expect(await verify("tok", "1.2.3.4")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws at call time, not import time, when the secret is missing and fallbacks are off", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "");
    expect(() => createCaptchaVerifier()).toThrow(/TURNSTILE_SECRET_KEY/);
  });

  it("passes every check when the secret is missing and ALLOW_DEV_FALLBACKS is exactly 'true'", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const verify = createCaptchaVerifier();
    expect(await verify("", "1.2.3.4")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not treat other values of ALLOW_DEV_FALLBACKS as the flag", () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    for (const value of ["1", "TRUE", "yes", "false"]) {
      vi.stubEnv("ALLOW_DEV_FALLBACKS", value);
      expect(() => createCaptchaVerifier()).toThrow(/TURNSTILE_SECRET_KEY/);
    }
  });

  it.each(["production", "preview"])("ignores the flag on a Vercel %s deployment", (vercelEnv) => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("ALLOW_DEV_FALLBACKS", "true");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    expect(() => createCaptchaVerifier()).toThrow(/TURNSTILE_SECRET_KEY/);
  });
});

import { createVerify, generateKeyPairSync } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsReport } from "@/components/admin/AnalyticsReport";
import {
  DEFAULT_RANGE,
  getGaReport,
  parseRange,
  problemFromApiError,
  readGaConfig,
  resetGaCache,
  signServiceAccountJwt,
  toReport,
  type GaConfig,
} from "@/lib/admin/ga-report";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const EMAIL = "ga-reader@terratech-analytics.iam.gserviceaccount.com";
const KEY_JSON = JSON.stringify({ type: "service_account", client_email: EMAIL, private_key: privateKey });
const CONFIG: GaConfig = { propertyId: "512345678", clientEmail: EMAIL, privateKey };

beforeEach(() => {
  resetGaCache();
  vi.stubEnv("GA_PROPERTY_ID", "");
  vi.stubEnv("GA_SERVICE_ACCOUNT_KEY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseRange", () => {
  it("takes 7, 28 or 90 and falls back to the default for anything else", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(["90", "7"])).toBe(90);
    for (const value of [undefined, "", "30", "abc", "-7"]) expect(parseRange(value)).toBe(DEFAULT_RANGE);
  });
});

describe("readGaConfig", () => {
  it("names the variables that are missing", () => {
    expect(readGaConfig({})).toEqual({ kind: "not-configured", missing: ["GA_PROPERTY_ID", "GA_SERVICE_ACCOUNT_KEY"] });
    expect(readGaConfig({ GA_PROPERTY_ID: "123", GA_SERVICE_ACCOUNT_KEY: "  " })).toEqual({
      kind: "not-configured",
      missing: ["GA_SERVICE_ACCOUNT_KEY"],
    });
  });

  it("reads a property number (with or without properties/) and a service account key", () => {
    expect(readGaConfig({ GA_PROPERTY_ID: " properties/512345678 ", GA_SERVICE_ACCOUNT_KEY: KEY_JSON })).toEqual(CONFIG);
  });

  it("turns literal \\n in the key back into line breaks", () => {
    const flattened = JSON.stringify({ client_email: EMAIL, private_key: privateKey.replace(/\n/g, "\\n") });
    const config = readGaConfig({ GA_PROPERTY_ID: "1", GA_SERVICE_ACCOUNT_KEY: flattened });
    expect("kind" in config ? null : config.privateKey).toBe(privateKey);
  });

  it("refuses a G- Measurement ID as the property, and anything that is not a key file", () => {
    expect(readGaConfig({ GA_PROPERTY_ID: "G-6Y9P91CSN2", GA_SERVICE_ACCOUNT_KEY: KEY_JSON })).toEqual({ kind: "bad-property" });
    for (const key of ["not json", "{}", JSON.stringify({ client_email: EMAIL, private_key: "abc" })]) {
      expect(readGaConfig({ GA_PROPERTY_ID: "1", GA_SERVICE_ACCOUNT_KEY: key })).toEqual({ kind: "bad-key" });
    }
  });
});

describe("signServiceAccountJwt", () => {
  it("is an RS256 JWT for the read-only Analytics scope, signed with the key, valid for an hour", () => {
    const jwt = signServiceAccountJwt(CONFIG, 1_800_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      iss: EMAIL,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const valid = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature!, "base64url"));
    expect(valid).toBe(true);
  });
});

// A batchRunReports answer: daily totals, the generate_lead count, pages, countries, channels.
function apiReports() {
  const row = (dims: string[], metrics: number[]) => ({
    dimensionValues: dims.map((value) => ({ value })),
    metricValues: metrics.map((value) => ({ value: String(value) })),
  });
  return [
    { rows: [row(["20261021"], [3, 4, 9]), row(["20261022"], [0, 0, 0])], totals: [row(["RESERVED_TOTAL"], [3, 4, 9])] },
    { rows: [row([], [2])] },
    { rows: [row(["/", "TerraTechBharat | Geosynthetics"], [6]), row(["/products", "Products | TerraTechBharat"], [3])] },
    { rows: [row(["India"], [2]), row(["United Arab Emirates"], [1])] },
    { rows: [row(["Direct"], [3]), row(["Organic Search"], [1])] },
  ];
}

describe("toReport", () => {
  it("maps the five reports to totals, days and ranked lists", () => {
    const report = toReport(7, apiReports(), new Date("2026-10-22T08:00:00Z"));
    expect(report.totals).toEqual({ activeUsers: 3, sessions: 4, pageViews: 9, quoteRequests: 2 });
    expect(report.daily).toEqual([
      { date: "2026-10-21", activeUsers: 3 },
      { date: "2026-10-22", activeUsers: 0 },
    ]);
    expect(report.topPages[0]).toEqual({ label: "/", detail: "TerraTechBharat | Geosynthetics", value: 6 });
    expect(report.countries.map((row) => row.label)).toEqual(["India", "United Arab Emirates"]);
    expect(report.sources[0]).toEqual({ label: "Direct", value: 3 });
  });

  it("reads an empty property as zeros and empty lists", () => {
    const report = toReport(28, [{}, {}, {}, {}, {}], new Date());
    expect(report.totals).toEqual({ activeUsers: 0, sessions: 0, pageViews: 0, quoteRequests: 0 });
    expect(report.daily).toEqual([]);
    expect(report.topPages).toEqual([]);
  });
});

describe("problemFromApiError", () => {
  it("tells a switched-off API apart from missing access", () => {
    const disabled = { error: { status: "PERMISSION_DENIED", message: "Google Analytics Data API has not been used in project 123 before or it is disabled." } };
    expect(problemFromApiError(403, disabled, CONFIG)).toEqual({ kind: "api-disabled" });
    const denied = { error: { status: "PERMISSION_DENIED", message: "User does not have sufficient permissions for this property." } };
    expect(problemFromApiError(403, denied, CONFIG)).toEqual({ kind: "no-access", clientEmail: EMAIL });
  });

  it("maps an unknown property, a refused token and anything else", () => {
    expect(problemFromApiError(404, null, CONFIG)).toEqual({ kind: "bad-property" });
    expect(problemFromApiError(401, null, CONFIG)).toEqual({ kind: "bad-key" });
    expect(problemFromApiError(500, { error: { status: "INTERNAL" } }, CONFIG)).toEqual({ kind: "failed", detail: "Google answered 500 INTERNAL" });
  });
});

describe("getGaReport", () => {
  function fakeGoogle(answer: { status: number; body: unknown } = { status: 200, body: { reports: apiReports() } }) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "token-1", expires_in: 3600 });
      }
      expect(href).toBe("https://analyticsdata.googleapis.com/v1beta/properties/512345678:batchRunReports");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-1");
      return Response.json(answer.body, { status: answer.status });
    });
  }

  it("returns the setup problem without calling Google when nothing is set", async () => {
    const fetchImpl = vi.fn();
    expect(await getGaReport(28, fetchImpl)).toEqual({ kind: "not-configured", missing: ["GA_PROPERTY_ID", "GA_SERVICE_ACCOUNT_KEY"] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks for the chosen period and keeps the answer for a few minutes", async () => {
    vi.stubEnv("GA_PROPERTY_ID", "512345678");
    vi.stubEnv("GA_SERVICE_ACCOUNT_KEY", KEY_JSON);
    const fetchImpl = fakeGoogle();
    const report = await getGaReport(7, fetchImpl);
    expect("kind" in report ? report : report.totals.pageViews).toBe(9);

    const sent = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body)) as { requests: { dateRanges: unknown[] }[] };
    expect(sent.requests).toHaveLength(5);
    expect(sent.requests[0]!.dateRanges).toEqual([{ startDate: "6daysAgo", endDate: "today" }]);
    expect(JSON.stringify(sent.requests[1])).toContain('"generate_lead"');

    await getGaReport(7, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // token + report, both reused
    await getGaReport(90, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // another period: one more report, same token
  });

  it("explains a refusal from Google instead of throwing", async () => {
    vi.stubEnv("GA_PROPERTY_ID", "512345678");
    vi.stubEnv("GA_SERVICE_ACCOUNT_KEY", KEY_JSON);
    const fetchImpl = fakeGoogle({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "User does not have sufficient permissions." } } });
    expect(await getGaReport(28, fetchImpl)).toEqual({ kind: "no-access", clientEmail: EMAIL });
  });

  it("reports a rejected key and a network failure", async () => {
    vi.stubEnv("GA_PROPERTY_ID", "512345678");
    vi.stubEnv("GA_SERVICE_ACCOUNT_KEY", KEY_JSON);
    const rejected = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await getGaReport(28, rejected)).toEqual({ kind: "bad-key" });
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await getGaReport(28, offline)).toEqual({ kind: "failed", detail: "could not reach Google" });
  });
});

describe("AnalyticsReport", () => {
  const html = renderToStaticMarkup(createElement(AnalyticsReport, { report: toReport(7, apiReports(), new Date()) }));

  it("shows the four headline numbers", () => {
    expect(html).toMatch(/data-testid="ga-visitors"[^>]*>3</);
    expect(html).toMatch(/data-testid="ga-page-views"[^>]*>9</);
    expect(html).toMatch(/data-testid="ga-quote-requests"[^>]*>2</);
  });

  it("labels every day's bar and lists the top pages, countries and sources", () => {
    expect(html).toContain("21 October 2026: 3 visitors");
    expect(html).toContain("22 October 2026: 0 visitors");
    for (const text of ["Products | TerraTechBharat", "United Arab Emirates", "Organic Search"]) expect(html).toContain(text);
  });
});

import "server-only";
import { createSign } from "node:crypto";
import { QUOTE_REQUEST_EVENT } from "@/lib/analytics";

// Reads the site's Google Analytics numbers for Admin > Analytics through the GA4 Data API, as a
// Google Cloud service account that has Viewer access to the property. Two server-only variables:
//   GA_PROPERTY_ID          the property's number (GA Admin > Property details), not the G- ID
//   GA_SERVICE_ACCOUNT_KEY  the whole JSON key file of the service account
// Plain fetch and node:crypto, so no Google client library: the service account signs a JWT,
// trades it for an access token, and one batchRunReports call fetches every table on the page.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const API = "https://analyticsdata.googleapis.com/v1beta";

/** The periods the page offers, in days, ending today (in the property's time zone). */
export const RANGES = [7, 28, 90] as const;
export type RangeDays = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeDays = 28;

/** `?range=` from the URL, falling back to the default for anything that is not on offer. */
export function parseRange(value: string | string[] | undefined): RangeDays {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return (RANGES as readonly number[]).includes(days) ? (days as RangeDays) : DEFAULT_RANGE;
}

export type GaConfig = { propertyId: string; clientEmail: string; privateKey: string };

export type GaProblem =
  /** One or both variables are not set: the page shows the setup steps. */
  | { kind: "not-configured"; missing: string[] }
  /** The key is not a service account JSON key, or Google refused it. */
  | { kind: "bad-key" }
  /** GA_PROPERTY_ID is not a property number, or no such property. */
  | { kind: "bad-property" }
  /** The Google Analytics Data API is not switched on in the service account's Cloud project. */
  | { kind: "api-disabled" }
  /** The service account has not been added to the property (Viewer is enough). */
  | { kind: "no-access"; clientEmail: string }
  /** Anything else: Google is down, the network failed, an unexpected answer. */
  | { kind: "failed"; detail: string };

/** Reads and checks the two variables. Never includes the private key in a problem. */
export function readGaConfig(env: Record<string, string | undefined> = process.env): GaConfig | GaProblem {
  const propertyRaw = env.GA_PROPERTY_ID?.trim() ?? "";
  const keyRaw = env.GA_SERVICE_ACCOUNT_KEY?.trim() ?? "";
  const missing = [!propertyRaw && "GA_PROPERTY_ID", !keyRaw && "GA_SERVICE_ACCOUNT_KEY"].filter(
    (name): name is string => !!name,
  );
  if (missing.length > 0) return { kind: "not-configured", missing };

  // "properties/123" and "123" both work; a G- Measurement ID is the usual mix-up.
  const propertyId = propertyRaw.replace(/^properties\//, "");
  if (!/^\d+$/.test(propertyId)) return { kind: "bad-property" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(keyRaw);
  } catch {
    return { kind: "bad-key" };
  }
  const key = parsed as { client_email?: unknown; private_key?: unknown };
  if (typeof key.client_email !== "string" || typeof key.private_key !== "string" || !key.private_key.includes("PRIVATE KEY")) {
    return { kind: "bad-key" };
  }
  // A key pasted through some editors arrives with literal "\n" instead of line breaks.
  return { propertyId, clientEmail: key.client_email, privateKey: key.private_key.replace(/\\n/g, "\n") };
}

// Access token ------------------------------------------------------------------------------------

const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** The signed JWT a service account sends to Google's token endpoint (RFC 7523). */
export function signServiceAccountJwt(config: GaConfig, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({ iss: config.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(config.privateKey);
  return `${header}.${claims}.${base64url(signature)}`;
}

class GaError extends Error {
  constructor(readonly problem: GaProblem) {
    super(problem.kind);
  }
}

// One token per key, kept until a minute before it runs out (they last an hour).
let cachedToken: { email: string; token: string; expiresAt: number } | null = null;

async function accessToken(config: GaConfig, fetchImpl: typeof fetch): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.email === config.clientEmail && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }
  let assertion: string;
  try {
    assertion = signServiceAccountJwt(config, Math.floor(now / 1000));
  } catch {
    throw new GaError({ kind: "bad-key" });
  }
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!response.ok || !body?.access_token) {
    // invalid_grant / invalid_client: a deleted or mistyped key.
    if (response.status === 400 || response.status === 401) throw new GaError({ kind: "bad-key" });
    throw new GaError({ kind: "failed", detail: `token request answered ${response.status}` });
  }
  cachedToken = { email: config.clientEmail, token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

/** For tests: forget the cached token and report. */
export function resetGaCache(): void {
  cachedToken = null;
  reportCache.clear();
}

// The report --------------------------------------------------------------------------------------

export type GaTotals = { activeUsers: number; sessions: number; pageViews: number; quoteRequests: number };
export type GaDay = { date: string; activeUsers: number };
export type GaRow = { label: string; detail?: string; value: number };

export type GaReport = {
  days: RangeDays;
  totals: GaTotals;
  /** One entry per day of the period, oldest first, days without visits included as 0. */
  daily: GaDay[];
  topPages: GaRow[];
  countries: GaRow[];
  sources: GaRow[];
  fetchedAt: string;
};

type ApiRow = { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] };
type ApiReport = { rows?: ApiRow[]; totals?: ApiRow[] };

const num = (row: ApiRow | undefined, index: number) => Number(row?.metricValues?.[index]?.value ?? 0) || 0;
const dim = (row: ApiRow, index: number) => row.dimensionValues?.[index]?.value ?? "";

function requests(days: RangeDays) {
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: "today" }];
  return [
    {
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
      metricAggregations: ["TOTAL"],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      keepEmptyRows: true,
    },
    {
      dateRanges,
      metrics: [{ name: "eventCount" }],
      dimensionFilter: { filter: { fieldName: "eventName", stringFilter: { value: QUOTE_REQUEST_EVENT, matchType: "EXACT" } } },
    },
    {
      dateRanges,
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
    },
    {
      dateRanges,
      dimensions: [{ name: "country" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 10,
    },
    {
      dateRanges,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    },
  ];
}

/** "20261022" -> "2026-10-22". */
function isoDate(gaDate: string): string {
  return /^\d{8}$/.test(gaDate) ? `${gaDate.slice(0, 4)}-${gaDate.slice(4, 6)}-${gaDate.slice(6, 8)}` : gaDate;
}

/** Turns the five reports of a batchRunReports answer into what the page shows. */
export function toReport(days: RangeDays, reports: ApiReport[], fetchedAt: Date): GaReport {
  const [daily, leads, pages, countries, sources] = reports;
  const rows = (report: ApiReport | undefined) => report?.rows ?? [];
  return {
    days,
    totals: {
      activeUsers: num(daily?.totals?.[0], 0),
      sessions: num(daily?.totals?.[0], 1),
      pageViews: num(daily?.totals?.[0], 2),
      quoteRequests: num(rows(leads)[0], 0),
    },
    daily: rows(daily).map((row) => ({ date: isoDate(dim(row, 0)), activeUsers: num(row, 0) })),
    topPages: rows(pages).map((row) => ({ label: dim(row, 0), detail: dim(row, 1) || undefined, value: num(row, 0) })),
    countries: rows(countries).map((row) => ({ label: dim(row, 0) || "(not set)", value: num(row, 0) })),
    sources: rows(sources).map((row) => ({ label: dim(row, 0) || "(not set)", value: num(row, 0) })),
    fetchedAt: fetchedAt.toISOString(),
  };
}

/** What a failed Data API call means for the person setting it up. */
export function problemFromApiError(status: number, body: unknown, config: GaConfig): GaProblem {
  const error = (body as { error?: { message?: string; status?: string } } | null)?.error;
  const message = error?.message ?? "";
  if (status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(`${message} ${JSON.stringify(body)}`)) {
    return { kind: "api-disabled" };
  }
  if (status === 403) return { kind: "no-access", clientEmail: config.clientEmail };
  if (status === 404 || (status === 400 && /property/i.test(message))) return { kind: "bad-property" };
  if (status === 401) return { kind: "bad-key" };
  return { kind: "failed", detail: `Google answered ${status}${error?.status ? ` ${error.status}` : ""}` };
}

// Five minutes is fresh enough for a dashboard and keeps well inside the Data API's quotas.
const REPORT_TTL_MS = 5 * 60_000;
const reportCache = new Map<string, { report: GaReport; expiresAt: number }>();

/** The numbers for the last `days` days, or what stops them from loading. Never throws. */
export async function getGaReport(days: RangeDays, fetchImpl: typeof fetch = fetch): Promise<GaReport | GaProblem> {
  const config = readGaConfig();
  if ("kind" in config) return config;

  const cacheKey = `${config.propertyId}:${days}`;
  const cached = reportCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.report;

  try {
    const token = await accessToken(config, fetchImpl);
    const response = await fetchImpl(`${API}/properties/${config.propertyId}:batchRunReports`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ requests: requests(days) }),
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return problemFromApiError(response.status, body, config);
    const reports = (body as { reports?: ApiReport[] } | null)?.reports;
    if (!Array.isArray(reports) || reports.length !== 5) return { kind: "failed", detail: "unexpected answer from Google" };
    const report = toReport(days, reports, new Date());
    reportCache.set(cacheKey, { report, expiresAt: Date.now() + REPORT_TTL_MS });
    return report;
  } catch (error) {
    if (error instanceof GaError) return error.problem;
    return { kind: "failed", detail: "could not reach Google" };
  }
}

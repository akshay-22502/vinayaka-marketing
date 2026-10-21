/** Read a required server-side env var; throws a clear error if it is unset or empty. */
export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

/**
 * True when the local/E2E-only flag ALLOW_DEV_FALLBACKS is exactly "true". Then an
 * unset TURNSTILE_SECRET_KEY lets the captcha pass and an unset RESEND_API_KEY
 * makes the mailer log instead of send, because a sandbox cannot reach Cloudflare
 * or Resend. Any other value, including "1" or "TRUE", is off.
 *
 * As a safety net it is also off on any Vercel deployment (Vercel sets VERCEL on
 * Production, Preview and `vercel dev` alike), so a flag copied there by mistake
 * cannot switch the captcha off for real visitors. Previews matter as much as
 * Production: they share the live database and send real email. Local runs,
 * including the E2E `next start`, have no VERCEL variable.
 */
function devFallbacksAllowed(): boolean {
  return process.env.ALLOW_DEV_FALLBACKS === "true" && !process.env.VERCEL;
}

/** True on a Vercel Preview deployment (a branch or pull request build), which must not be indexed. */
function isVercelPreview(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

/** Validates a site address: a full http(s) URL. Returns its origin (no trailing slash or path). */
function parseSiteUrl(raw: string): string {
  const invalid = () =>
    new Error(
      `NEXT_PUBLIC_SITE_URL must be a full URL starting with http:// or https://, such as https://www.terratechbharat.com (got "${raw}").`,
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  // "localhost:3000" and "example.com:443" parse as URLs whose "protocol" is the host.
  if (url.protocol !== "http:" && url.protocol !== "https:") throw invalid();
  return url.origin;
}

/**
 * The public address of the site, without a trailing slash (for example
 * "https://www.terratechbharat.com"): the base for canonical links, Open Graph
 * URLs, the sitemap and structured data. Server-side only (VERCEL_URL is not
 * a public variable), which is where every caller runs.
 *
 * Resolved in this order:
 *  1. NEXT_PUBLIC_SITE_URL, when set;
 *  2. on a Vercel Preview or `vercel dev` (VERCEL_ENV "preview" or "development"),
 *     https://<VERCEL_URL>, so those builds work without any setup;
 *  3. outside production (`next dev`, unit tests), http://localhost:3000;
 *  4. otherwise it throws: a production build without the variable would put
 *     localhost in canonical links and the sitemap, which silently hurts ranking.
 */
function siteUrl(): string {
  // Written out in full (not process.env[name]) so Next can inline it.
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return parseSiteUrl(configured);

  const vercelEnv = process.env.VERCEL_ENV;
  const vercelHost = process.env.VERCEL_URL?.trim();
  if ((vercelEnv === "preview" || vercelEnv === "development") && vercelHost) {
    return parseSiteUrl(`https://${vercelHost}`);
  }

  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";

  throw new Error(
    "Missing required environment variable NEXT_PUBLIC_SITE_URL (for example https://www.terratechbharat.com). See .env.example.",
  );
}

/**
 * The public Cloudflare Turnstile site key, or undefined when it is not set (the quote form then
 * shows no captcha, which is how the sandbox and E2E run). Blank counts as unset.
 */
function turnstileSiteKey(): string | undefined {
  // Written out in full (not process.env[name]) so Next can inline it.
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || undefined;
}

/**
 * The Google Analytics 4 Measurement ID (for example "G-ABC123XYZ9"), or undefined when the tag must
 * stay off: the variable is unset, blank or not a GA4 ID, or this is a Vercel Preview (previews
 * would count test visits as real traffic). Read where the page is rendered, so changing it on
 * Vercel takes effect at the next deployment.
 */
function gaMeasurementId(): string | undefined {
  if (isVercelPreview()) return undefined;
  // Written out in full (not process.env[name]) so Next can inline it.
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim().toUpperCase();
  return id && /^G-[A-Z0-9]{4,}$/.test(id) ? id : undefined;
}

export const env = {
  requireServerEnv,
  devFallbacksAllowed,
  get NEXT_PUBLIC_SITE_URL(): string {
    return siteUrl();
  },
  get NEXT_PUBLIC_TURNSTILE_SITE_KEY(): string | undefined {
    return turnstileSiteKey();
  },
  get NEXT_PUBLIC_GA_MEASUREMENT_ID(): string | undefined {
    return gaMeasurementId();
  },
  isVercelPreview,
};

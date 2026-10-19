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
 * The public address of the site, without a trailing slash (for example
 * "https://www.terratechbharat.com"): the base for canonical links, Open Graph
 * URLs, the sitemap and structured data.
 *
 * Outside production (`next dev`, unit tests) an unset value falls back to
 * http://localhost:3000. In a production build it is required, because a
 * canonical link or sitemap pointing at localhost would silently hurt search
 * ranking.
 */
function siteUrl(): string {
  // Written out in full (not process.env[name]) so Next can inline it.
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing required environment variable NEXT_PUBLIC_SITE_URL (for example https://www.terratechbharat.com). See .env.example.",
      );
    }
    return "http://localhost:3000";
  }
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL must be a full URL such as https://www.terratechbharat.com (got "${raw}").`,
    );
  }
}

export const env = {
  requireServerEnv,
  get NEXT_PUBLIC_SITE_URL(): string {
    return siteUrl();
  },
};

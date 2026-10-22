import type { Page } from "@playwright/test";

// The E2E build has a made-up Google Analytics ID (scripts/e2e-prepare.ts), so public pages ask for
// Google's gtag.js. This answers that request with an empty script, so nothing leaves the machine
// and a missing network does not show up as a console error. The inline init in GoogleAnalytics
// still runs, so the queued gtag commands can be read from window.dataLayer.

export const GTAG_URL = "https://www.googletagmanager.com/gtag/js**";

/** Stubs gtag.js on this page and returns the script URLs that were asked for. */
export async function stubGtag(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route(GTAG_URL, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ contentType: "text/javascript", body: "/* gtag.js stub */" });
  });
  return requested;
}

// Google Analytics events sent from the browser. The gtag.js tag itself is loaded by
// <GoogleAnalytics> on public pages only, and only when a Measurement ID is set; without it
// window.gtag does not exist and these calls do nothing.

import type { Country } from "@/lib/content/types";

type Gtag = (command: "event", name: string, params?: Record<string, string | number>) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

/** GA4's recommended event for a submitted lead form; mark it as a key event in Google Analytics. */
export const QUOTE_REQUEST_EVENT = "generate_lead";

/**
 * Reports a quote request that the server accepted. Only the country and how many products were
 * ticked are sent: never the visitor's name, email, phone or message (Google's terms forbid
 * personal data in Analytics).
 */
export function trackQuoteRequest(country: Country, productCount: number): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", QUOTE_REQUEST_EVENT, {
    form_name: "quote_request",
    country,
    product_count: productCount,
  });
}

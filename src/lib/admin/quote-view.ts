import { displayName } from "./upload";
import type { QuoteStatus } from "./quote-filters";

// Small pure helpers for showing a quote request. Everything a buyer typed is shown as text; these
// only decide labels and which values may become links.

/** The longest admin note (the form's maxlength and the schema's limit). */
export const ADMIN_NOTES_MAX = 5000;

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  closed: "Closed",
};

/**
 * `mailto:` link for a buyer's email, or null. The address was checked when the request was sent, but a
 * row can reach the table another way, and a link is built from it, so it is checked again, strictly:
 * only characters that cannot add a `?subject=`, a second recipient or a header to the link.
 */
export function safeMailto(email: string): string | null {
  const text = email.trim();
  return /^[A-Za-z0-9._+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(text) ? `mailto:${text}` : null;
}

/** The file name the buyer sent, from the path it is stored under (`2026-10/<uuid>-name.pdf`). */
export function attachmentLabel(path: string): string {
  return displayName(path);
}

/** Whether a storage error means "there is no such file" (and not an outage or a permission problem). */
export function isMissingFileError(error: { message?: unknown; statusCode?: unknown } | null | undefined): boolean {
  if (!error) return false;
  return String(error.statusCode) === "404" || /not found/i.test(String(error.message ?? ""));
}

/** Product names for the slugs stored on a request; a product that no longer exists is shown by its slug. */
export function productLabels(slugs: string[], names: ReadonlyMap<string, string>): string[] {
  return slugs.map((slug) => names.get(slug) ?? slug);
}

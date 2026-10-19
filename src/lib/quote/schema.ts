import { z } from "zod";
import type { Country } from "@/lib/content/types";

// What the quote form may send. The route turns the posted form into the plain object this
// schema parses (see `handle.ts`), so the same rules apply whoever calls the API.

const REQUIRED_MIN = 2;
const MESSAGE_MAX = 5000;
const PRODUCTS_MAX = 20;
/** Longest product slug kept; longer ones cannot be real and are dropped like unknown slugs. */
export const PRODUCT_SLUG_MAX = 100;

const COUNTRIES = ["IN", "AE"] as const satisfies readonly Country[];

/** A required text field: trimmed, at least 2 characters. */
function required(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(REQUIRED_MIN, `${label} must be at least ${REQUIRED_MIN} characters`)
    .max(max, `${label} must be at most ${max} characters`);
}

/** An optional text field: trimmed, and blank means "not given". */
function optional(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((value) => (value ? value : undefined));
}

export const quoteSchema = z.object({
  name: required("Name", 200),
  company: optional("Company", 200),
  email: z
    .string()
    .trim()
    .pipe(z.email("Enter a valid email address").max(254, "Email must be at most 254 characters")),
  phone: required("Phone", 50),
  country: z.enum(COUNTRIES, { error: "Choose India or the UAE" }),
  // Product slugs. Unknown ones are dropped later, against the database, without an error.
  products: z
    .array(z.string())
    .max(PRODUCTS_MAX, `Choose at most ${PRODUCTS_MAX} products`)
    .transform((slugs) => [
      ...new Set(slugs.map((slug) => slug.trim()).filter((slug) => slug && slug.length <= PRODUCT_SLUG_MAX)),
    ])
    .default([]),
  quantity: optional("Quantity", 200),
  projectLocation: optional("Project location", 200),
  message: required("Message", MESSAGE_MAX),
  // Cloudflare Turnstile token. Checked against Cloudflare, not here, so a missing one is a
  // failed captcha (403) rather than a field error.
  turnstileToken: z.string().trim().max(4096, "Captcha token is too long").default(""),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

// Attachments ---------------------------------------------------------------

/** The most the quote API accepts, and the limit set on the `quote-attachments` bucket. */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

const GENERIC_TYPES = ["", "application/octet-stream"];

export type AttachmentType = { storedAs: string; reported: string[] };

/**
 * Allowed extensions, with the content type each is stored as and the types browsers report.
 * A Map, not an object: looking up "constructor" or "__proto__" in a plain object finds
 * inherited properties, which would let those extensions through as if they were allowed.
 */
const ATTACHMENT_TYPES: ReadonlyMap<string, AttachmentType> = new Map<string, AttachmentType>([
  ["pdf", { storedAs: "application/pdf", reported: ["application/pdf", "application/x-pdf"] }],
  ["jpg", { storedAs: "image/jpeg", reported: ["image/jpeg", "image/pjpeg"] }],
  ["jpeg", { storedAs: "image/jpeg", reported: ["image/jpeg", "image/pjpeg"] }],
  ["png", { storedAs: "image/png", reported: ["image/png"] }],
  [
    "dwg",
    {
      storedAs: "image/vnd.dwg",
      reported: [
        "image/vnd.dwg",
        "image/x-dwg",
        "application/acad",
        "application/x-acad",
        "application/autocad_dwg",
        "application/dwg",
        "application/x-dwg",
        "application/x-autocad",
      ],
    },
  ],
]);

/** Lower-case extension of a file name, without the dot; "" when there is none. */
export function attachmentExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The allowed type for a file name, from its extension; undefined when it may not be attached. */
export function attachmentType(fileName: string): AttachmentType | undefined {
  return ATTACHMENT_TYPES.get(attachmentExtension(fileName));
}

/** Why a file cannot be attached, or null when it can (and when there is no file). */
export function validateAttachment(file: File | null): string | null {
  if (!file) return null;
  if (file.size === 0) return "The attachment is empty.";
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return "The attachment is larger than 4 MB. Send a smaller file, and email larger drawings to us after we reply.";
  }
  const allowed = attachmentType(file.name);
  if (!allowed) return "The attachment must be a PDF, JPG, PNG or DWG file.";
  const type = file.type.toLowerCase().split(";")[0]!.trim();
  if (!GENERIC_TYPES.includes(type) && !allowed.reported.includes(type)) {
    return "The attachment must be a PDF, JPG, PNG or DWG file.";
  }
  return null;
}

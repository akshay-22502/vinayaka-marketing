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

// Attachments live in ./attachment (no zod there, so the browser can use them too); re-exported
// here so the server code keeps importing everything quote-related from one place.
export {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  attachmentExtension,
  attachmentType,
  validateAttachment,
  type AttachmentType,
} from "./attachment";

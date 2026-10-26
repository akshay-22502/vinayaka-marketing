// What the quote form checks in the browser before it posts, and how it reads the answer.
//
// The server (`schema.ts`, `handle.ts`) is the authority; these checks only save a round trip and
// put the message next to the field. They follow the same rules, and tests/unit/quote-form-checks
// compares them with the server schema so the two cannot drift apart unnoticed. Like
// `attachment.ts`, this file ships to the browser, so it must not import zod or anything
// server-only.

import type { Country } from "@/lib/content/types";
import { validateAttachment } from "./attachment";

/** The fields, in the order they appear on the page (the first invalid one gets the focus). */
export const FIELD_ORDER = [
  "name",
  "company",
  "email",
  "phone",
  "country",
  "categories",
  "quantity",
  "projectLocation",
  "message",
  "attachment",
] as const;

export type QuoteField = (typeof FIELD_ORDER)[number];

/** Same limits as `quoteSchema`. */
export const FIELD_LIMITS = {
  /** Required text fields need at least this many characters once trimmed. */
  requiredMin: 2,
  name: 200,
  company: 200,
  email: 254,
  phone: 50,
  quantity: 200,
  projectLocation: 200,
  message: 5000,
  categories: 20,
} as const;

export type QuoteFormValues = {
  name: string;
  company: string;
  email: string;
  phone: string;
  /** "IN", "AE", or "" when none is chosen. */
  country: string;
  /** Slugs of the ticked product categories. */
  categories: string[];
  quantity: string;
  projectLocation: string;
  message: string;
  attachment: File | null;
};

export type FieldErrors = Record<string, string>;

// The pattern zod uses for z.email(), so the browser accepts and refuses the same addresses.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

function tooLong(label: string, max: number): string {
  return `${label} must be at most ${max} characters`;
}

/** A required text field: filled in, at least two characters, and not too long. */
function checkRequired(value: string, label: string, ask: string, max: number): string | undefined {
  const text = value.trim();
  if (text === "") return ask;
  if (text.length < FIELD_LIMITS.requiredMin) return `${label} must be at least ${FIELD_LIMITS.requiredMin} characters`;
  if (text.length > max) return tooLong(label, max);
  return undefined;
}

/** An optional text field: only its length can be wrong. */
function checkOptional(value: string, label: string, max: number): string | undefined {
  return value.trim().length > max ? tooLong(label, max) : undefined;
}

/** Everything wrong with the form, by field name. An empty object means it can be sent. */
export function checkQuoteForm(values: QuoteFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const put = (field: QuoteField, message: string | undefined) => {
    if (message) errors[field] = message;
  };

  put("name", checkRequired(values.name, "Name", "Enter your name", FIELD_LIMITS.name));
  put("company", checkOptional(values.company, "Company", FIELD_LIMITS.company));

  const email = values.email.trim();
  if (email === "") put("email", "Enter your email address");
  else if (!EMAIL.test(email)) put("email", "Enter a valid email address");
  else if (email.length > FIELD_LIMITS.email) put("email", tooLong("Email", FIELD_LIMITS.email));

  put("phone", checkRequired(values.phone, "Phone", "Enter your phone number", FIELD_LIMITS.phone));
  if (values.country !== "IN" && values.country !== "AE") put("country", "Choose India or the UAE");
  if (values.categories.length > FIELD_LIMITS.categories) {
    put("categories", `Choose at most ${FIELD_LIMITS.categories} categories`);
  }
  put("quantity", checkOptional(values.quantity, "Quantity", FIELD_LIMITS.quantity));
  put("projectLocation", checkOptional(values.projectLocation, "Project location", FIELD_LIMITS.projectLocation));
  put("message", checkRequired(values.message, "Message", "Tell us what you need", FIELD_LIMITS.message));
  put("attachment", validateAttachment(values.attachment) ?? undefined);

  return errors;
}

/** The field to focus: the first one on the page that has an error. Keys that are not fields are skipped. */
export function firstInvalidField(errors: FieldErrors): QuoteField | null {
  return FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}

// The answer from POST /api/quote ----------------------------------------------------------------

export const GENERIC_ERROR_MESSAGE =
  "Something went wrong, so your request was not sent. Please try again in a moment, or contact us directly.";

export const NETWORK_ERROR_MESSAGE =
  "We could not reach the server. Please check your connection and try again.";

const TOO_LARGE_MESSAGE =
  "Your request was too large to send. Remove the attachment or choose a smaller file, then try again.";

export type QuoteOutcome =
  | { kind: "sent"; team: Country }
  | { kind: "invalid"; message: string; errors: FieldErrors }
  | { kind: "failed"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCountry(value: unknown): value is Country {
  return value === "IN" || value === "AE";
}

/**
 * Turns the HTTP status and parsed JSON body (null when the body was not JSON) of the answer
 * into what the form shows. `submitted` is the country that was sent; it names the team if the
 * answer does not.
 */
export function interpretQuoteResponse(status: number, body: unknown, submitted: Country): QuoteOutcome {
  const data = isRecord(body) ? body : {};
  const message = typeof data.message === "string" && data.message.trim() !== "" ? data.message : null;

  if (status === 200 && data.ok === true) {
    return { kind: "sent", team: isCountry(data.team) ? data.team : submitted };
  }

  if (status === 400 && isRecord(data.errors)) {
    const errors: FieldErrors = {};
    for (const [field, text] of Object.entries(data.errors)) {
      if (typeof text === "string" && text !== "") errors[field] = text;
    }
    if (Object.keys(errors).length > 0) {
      return { kind: "invalid", message: message ?? "Please check the highlighted fields and try again.", errors };
    }
  }

  if (status === 413) return { kind: "failed", message: message ?? TOO_LARGE_MESSAGE };
  return { kind: "failed", message: message ?? GENERIC_ERROR_MESSAGE };
}

/** "India" or "UAE": how the thank-you message names the team that will reply. */
export function teamName(country: Country): string {
  return country === "IN" ? "India" : "UAE";
}

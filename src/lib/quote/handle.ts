import type { Country } from "@/lib/content/types";
import { renderBuyerEmail, renderTeamEmail } from "./emails";
import { hashIp } from "./ip";
import type { Mailer } from "./mailer";
import { quoteSchema, validateAttachment, type QuoteInput } from "./schema";
import type { QuoteStore } from "./store";

export interface QuoteDeps {
  store: QuoteStore;
  mailer: Mailer;
  verifyCaptcha(token: string, ip: string): Promise<boolean>;
  /** Secret mixed into the ip hash (IP_HASH_SALT). */
  salt: string;
  now(): Date;
}

export type QuoteResult = {
  status: 200 | 400 | 403 | 429 | 500;
  body: {
    ok: boolean;
    /** Field name to message, for a 400. `attachment` is the file field. */
    errors?: Record<string, string>;
    message?: string;
    /** On 200: the saved request's id and the team that will answer (IN = India, AE = UAE). */
    id?: string;
    team?: Country;
  };
};

/** The most requests one ip hash may make in the rolling hour; the next one gets a 429. */
export const RATE_LIMIT_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

const MESSAGES = {
  invalid: "Please check the highlighted fields and try again.",
  captcha: "We could not verify that you are human. Please try again.",
  rateLimit: "You have sent several requests in a short time. Please try again in an hour, or contact us directly.",
  server: "Something went wrong on our side, so your request was not sent. Please try again in a moment, or contact us directly.",
  upload: "We could not save your attachment, so your request was not sent. Please try again, or send it without the file.",
} as const;

/** The posted form as the plain object `quoteSchema` parses. Anything that is not text becomes "". */
function readFields(form: FormData): Record<string, unknown> {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    products: form.getAll("products").filter((value): value is string => typeof value === "string"),
    categories: form.getAll("categories").filter((value): value is string => typeof value === "string"),
    quantity: text("quantity"),
    projectLocation: text("projectLocation"),
    message: text("message"),
    turnstileToken: text("cf-turnstile-response"),
  };
}

/** The attachment, or null when none was chosen (browsers send an empty, unnamed file part). */
function readAttachment(form: FormData): File | null {
  const value = form.get("attachment");
  if (value === null || typeof value === "string") return null;
  if (value.size === 0 && value.name === "") return null;
  return value;
}

function fail(status: 400 | 403 | 429 | 500, message: string, errors?: Record<string, string>): QuoteResult {
  return { status, body: { ok: false, message, ...(errors ? { errors } : {}) } };
}

type OutgoingEmail = Parameters<Mailer["send"]>[0];

/**
 * Builds and sends one email; returns whether it went out. Rendering happens inside the try
 * on purpose: the request is already saved by now, so a failure anywhere in here (a template
 * bug as much as a mail outage) is logged and never thrown.
 */
async function trySend(mailer: Mailer, what: string, id: string, build: () => OutgoingEmail): Promise<boolean> {
  try {
    await mailer.send(build());
    return true;
  } catch (error) {
    console.error(`[quote ${id}] ${what} email failed:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Handles one quote request. In order:
 *  1. validate the fields and the attachment (400);
 *  2. check the captcha (403);
 *  3. rate-limit by ip hash, 5 per rolling hour (429);
 *  4. upload the attachment and insert the row, which comes before any email (500 if it fails);
 *  5. email the country's team (recipient from the database, never from the request) and the buyer.
 *
 * Once the row is saved the answer is 200, whatever happens to the emails: a failure is logged and
 * leaves `email_sent` false so the admin panel can flag it.
 */
export async function handleQuote(form: FormData, ip: string, deps: QuoteDeps): Promise<QuoteResult> {
  // 1. Validate.
  const parsed = quoteSchema.safeParse(readFields(form));
  const attachment = readAttachment(form);
  const attachmentError = validateAttachment(attachment);

  if (!parsed.success || attachmentError) {
    const errors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] ??= issue.message;
      }
    }
    if (attachmentError) errors.attachment = attachmentError;
    return fail(400, MESSAGES.invalid, errors);
  }
  const input: QuoteInput = parsed.data;

  const { store, mailer } = deps;
  let knownSlugs: string[];
  let productNames: string[];
  let categories: Array<{ slug: string; name: string }>;
  let attachmentPath: string | null = null;
  let id: string;

  try {
    // 2. Captcha.
    if (!(await deps.verifyCaptcha(input.turnstileToken, ip))) {
      return fail(403, MESSAGES.captcha);
    }

    // 3. Rate limit.
    const ipHash = hashIp(ip, deps.salt);
    const since = new Date(deps.now().getTime() - HOUR_MS);
    if ((await store.countSince(ipHash, since)) >= RATE_LIMIT_PER_HOUR) {
      return fail(429, MESSAGES.rateLimit);
    }

    // Unknown product slugs are dropped, not an error.
    knownSlugs = input.products.length > 0 ? await store.knownProductSlugs(input.products) : [];
    productNames = knownSlugs.length > 0 ? await store.productNames(knownSlugs) : [];
    categories = input.categories.length > 0 ? await store.listedCategories(input.categories) : [];

    // 4. Save: the attachment first, then the row. This must come before any email.
    if (attachment) {
      try {
        attachmentPath = await store.uploadAttachment(attachment);
      } catch (error) {
        console.error("[quote] attachment upload failed:", error instanceof Error ? error.message : error);
        return fail(500, MESSAGES.upload);
      }
    }

    ({ id } = await store.insert({
      name: input.name,
      company: input.company ?? null,
      email: input.email,
      phone: input.phone,
      country: input.country,
      products: knownSlugs,
      categories: categories.map((category) => category.slug),
      quantity: input.quantity ?? null,
      projectLocation: input.projectLocation ?? null,
      message: input.message,
      attachmentPath,
      ipHash,
    }));
  } catch (error) {
    console.error("[quote] could not process the request:", error instanceof Error ? error.message : error);
    return fail(500, MESSAGES.server);
  }

  // 5. Emails. Nothing below can fail the request: the row is already saved.
  // The emails list what the buyer asked about: the categories they ticked, then any products.
  const wanted = [...categories.map((category) => category.name), ...productNames];
  let recipient: string | null = null;
  try {
    recipient = await store.recipientFor(input.country);
  } catch (error) {
    console.error(`[quote ${id}] recipient lookup failed:`, error instanceof Error ? error.message : error);
  }

  let teamEmailSent = false;
  if (recipient) {
    const to = recipient;
    teamEmailSent = await trySend(mailer, "team", id, () => ({
      to,
      replyTo: input.email,
      ...renderTeamEmail(input, wanted, id, { hasAttachment: attachmentPath !== null }),
    }));
  } else {
    console.error(`[quote ${id}] no quote recipient is set for ${input.country}; the team was not emailed.`);
  }

  await trySend(mailer, "buyer", id, () => ({ to: input.email, ...renderBuyerEmail(input, wanted, id) }));

  if (teamEmailSent) {
    try {
      await store.markEmailSent(id);
    } catch (error) {
      console.error(`[quote ${id}] could not mark the request as emailed:`, error instanceof Error ? error.message : error);
    }
  }

  return { status: 200, body: { ok: true, id, team: input.country } };
}

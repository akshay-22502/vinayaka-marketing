import { z } from "zod";
import { slugify, truncateSlug } from "@/lib/slug";
import { FORM_ERROR, PUBLISH_CONFIRM_FIELD } from "./action-result";

export { PUBLISH_CONFIRM_FIELD };

// One zod schema per admin form. They take what a browser posts (strings, repeated fields as
// arrays) and give back a database row: snake_case columns, blank optional values as null,
// numbers as numbers. Fields the schema does not name are dropped, so a hand-made request cannot
// set other columns.

export const SLUG_EMPTY_MESSAGE = "Enter a URL slug using letters a–z, numbers and hyphens";
export const SLUG_INVALID_MESSAGE =
  "Use lowercase letters a–z, numbers and single hyphens only, up to 100 characters (for example roads-and-pavements)";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 100;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A storage path inside the public-media bucket: folders and a file name, nothing that climbs out.
const STORAGE_PATH_PATTERN = /^(?!\/)[A-Za-z0-9._\-/]+$/;
const MAX_IMAGES = 20;
const MAX_LINKED_PRODUCTS = 500;
const MAX_LINKED_APPLICATIONS = 200;
const MAX_FEATURES = 30;
const MAX_FEATURE_LENGTH = 300;

// Building blocks ---------------------------------------------------------------

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

/** Required one-line text. */
function requiredLine(label: string, required: string, max: number) {
  return z
    .string({ error: required })
    .trim()
    .min(1, required)
    .max(max, `${label} must be ${max} characters or fewer`);
}

/** Optional one-line text; blank is "". */
export function line(label: string, max: number) {
  return z.string().trim().max(max, `${label} must be ${max} characters or fewer`).default("");
}

/** Optional multi-line text (browsers post line breaks as CRLF). */
export function paragraphs(label: string, max: number) {
  return z
    .string()
    .overwrite(normalizeNewlines)
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .default("");
}

const slugField = z.string().trim().default("");

const sortOrder = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || /^-?\d{1,6}$/.test(value), "Enter a whole number")
  .transform((value) => Number(value) || 0);

/** A checkbox: browsers post "on" when ticked and nothing when not. */
const published = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true");

function isValidStoragePath(path: string): boolean {
  return path.length <= 300 && STORAGE_PATH_PATTERN.test(path) && !path.includes("..");
}

/** A file uploaded to the public-media bucket; blank means no file. */
const storagePath = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || isValidStoragePath(value), "That file path is not valid")
  .transform((value) => (value === "" ? null : value));

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const optionalDate = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || isRealDate(value), "Enter a valid date")
  .transform((value) => (value === "" ? null : value));

const toArray = (value: unknown) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

/**
 * The slug the row will get: the typed one, else one made from the name or title. A derived slug
 * is shortened to the 100-character limit at a hyphen, so a long name never fails with a slug
 * error the admin did not cause; a typed slug that is too long is refused instead.
 */
function slugFor(slug: string, source: string): string {
  return slug || truncateSlug(slugify(source), SLUG_MAX_LENGTH);
}

/**
 * Checks the slug the form will end up with. A name with no Latin letters (Hindi, Arabic)
 * makes an empty slug, so the admin must type one.
 */
function checkSlug(slug: string, source: string, ctx: z.core.$RefinementCtx): void {
  const final = slugFor(slug, source);
  if (final === "") {
    // A missing name or title already has its own message.
    if (!slug && source.trim() === "") return;
    ctx.addIssue({ code: "custom", path: ["slug"], message: SLUG_EMPTY_MESSAGE });
    return;
  }
  if (final.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(final)) {
    ctx.addIssue({ code: "custom", path: ["slug"], message: SLUG_INVALID_MESSAGE });
  }
}

// Entities ----------------------------------------------------------------------

export const categorySchema = z
  .object({
    name: requiredLine("Name", "Enter a name", 120),
    slug: slugField,
    intro: paragraphs("Intro", 2000),
    image_path: storagePath,
    sort_order: sortOrder,
    published,
  })
  .superRefine((value, ctx) => checkSlug(value.slug, value.name, ctx))
  .transform((value) => ({ ...value, slug: slugFor(value.slug, value.name) }));

export const applicationSchema = z
  .object({
    name: requiredLine("Name", "Enter a name", 120),
    slug: slugField,
    summary: paragraphs("Summary", 500),
    body: paragraphs("Details", 20000),
    image_path: storagePath,
    sort_order: sortOrder,
    published,
  })
  .superRefine((value, ctx) => checkSlug(value.slug, value.name, ctx))
  .transform((value) => ({ ...value, slug: slugFor(value.slug, value.name) }));

export const certificationSchema = z.object({
  name: requiredLine("Name", "Enter a name", 200),
  issuer: line("Issuer", 200),
  valid_until: optionalDate,
  file_path: storagePath,
  image_path: storagePath,
  sort_order: sortOrder,
  published,
});

const imageList = z
  .preprocess(toArray, z.array(z.string()))
  .transform((items) => items.map((item) => item.trim()).filter(Boolean))
  .superRefine((items, ctx) => {
    if (items.length > MAX_IMAGES) {
      ctx.addIssue({ code: "custom", message: `Up to ${MAX_IMAGES} images are allowed` });
    } else if (!items.every(isValidStoragePath)) {
      ctx.addIssue({ code: "custom", message: "One of the image file paths is not valid" });
    }
  });

const productIdList = z
  .preprocess(
    toArray,
    z.array(z.string().trim().regex(UUID_PATTERN, "Choose products from the list")).max(MAX_LINKED_PRODUCTS, "Too many products selected"),
  )
  .transform((ids) => [...new Set(ids)]);

const applicationIdList = z
  .preprocess(
    toArray,
    z
      .array(z.string().trim().regex(UUID_PATTERN, "Choose applications from the list"))
      .max(MAX_LINKED_APPLICATIONS, "Too many applications selected"),
  )
  .transform((ids) => [...new Set(ids)]);

/** Features are typed one per line in a textarea; blank lines are dropped. */
const featureList = z
  .string()
  .default("")
  .transform((text) =>
    normalizeNewlines(text)
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .superRefine((items, ctx) => {
    if (items.length > MAX_FEATURES) {
      ctx.addIssue({ code: "custom", message: `A product can have up to ${MAX_FEATURES} features` });
    } else if (items.some((item) => item.length > MAX_FEATURE_LENGTH)) {
      ctx.addIssue({ code: "custom", message: `Each feature must be ${MAX_FEATURE_LENGTH} characters or fewer` });
    }
  });

export const projectSchema = z
  .object({
    title: requiredLine("Title", "Enter a title", 200),
    slug: slugField,
    location: line("Location", 200),
    country: z.enum(["IN", "AE"], { error: "Choose a country" }),
    summary: paragraphs("Summary", 500),
    body: paragraphs("Details", 20000),
    images: imageList,
    product_ids: productIdList,
    sort_order: sortOrder,
    published,
  })
  .superRefine((value, ctx) => checkSlug(value.slug, value.title, ctx))
  .transform((value) => ({ ...value, slug: slugFor(value.slug, value.title) }));

// Products ----------------------------------------------------------------------

/** The line the seed puts at the end of every overview: the owner deletes it once the values are checked. */
const DATASHEET_REMINDER = /confirm\s+against\s+the\s+manufacturer['\u2019]s\s+datasheet\s+before\s+publishing/i;

/** Whether an overview still carries the seeded "confirm against the datasheet" reminder. */
export function hasDatasheetReminder(overview: string): boolean {
  return DATASHEET_REMINDER.test(overview);
}

export const PUBLISH_NOTE_MESSAGE =
  "The overview still contains the reminder \u201cConfirm against the manufacturer\u2019s datasheet before publishing\u201d. " +
  "Check the specification values against the datasheet, then delete that line from the overview. " +
  "To publish with the reminder visible to visitors anyway, tick the box and save again.";

export const productSchema = z
  .object({
    name: requiredLine("Name", "Enter a name", 200),
    slug: slugField,
    category_id: z.string({ error: "Choose a category" }).trim().regex(UUID_PATTERN, "Choose a category"),
    summary: paragraphs("Summary", 500),
    overview: paragraphs("Overview", 20000),
    features: featureList,
    images: imageList,
    datasheet_path: storagePath,
    application_ids: applicationIdList,
    /** Ticked after the form refused to publish while the datasheet reminder is still in the overview. */
    confirm_unverified: published,
    sort_order: sortOrder,
    published,
  })
  .superRefine((value, ctx) => {
    checkSlug(value.slug, value.name, ctx);
    if (value.published && !value.confirm_unverified && hasDatasheetReminder(value.overview)) {
      ctx.addIssue({ code: "custom", path: [PUBLISH_CONFIRM_FIELD], message: PUBLISH_NOTE_MESSAGE });
    }
  })
  .transform((value) => ({ ...value, slug: slugFor(value.slug, value.name) }));

// Parsing -------------------------------------------------------------------------

export type Parsed<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

/** Validates input and returns the row, or the first message for each field. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): Parsed<z.output<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : FORM_ERROR;
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** A FormData as an object: a field posted once is its value, a repeated field is an array. */
export function formToObject(form: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const object: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key);
    object[key] = values.length === 1 ? values[0] : values;
  }
  return object;
}

export function parseForm<S extends z.ZodType>(schema: S, form: FormData): Parsed<z.output<S>> {
  return parseInput(schema, formToObject(form));
}

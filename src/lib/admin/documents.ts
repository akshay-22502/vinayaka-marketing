import { z } from "zod";
import { PURCHASE_STEPS, optionalDate } from "./purchases";
import { UUID_PATTERN, line, paragraphs } from "./schemas";
import { displayName } from "./upload";

// Documents kept with a purchase (invoices, packing lists, bills of entry, agents' bills...) and
// the categories they are filed under. Plain module (no server or browser APIs), so pages,
// actions and unit tests share it.

/** The private bucket the files are in. */
export const DOCUMENTS_BUCKET = "purchase-documents";

/** How long a download link made for the purchase page works. */
export const DOCUMENT_LINK_SECONDS = 10 * 60;

/** The folder a purchase's files go in. The database refuses a document whose path is not under `purchases/`. */
export function documentFolder(purchaseId: string): string {
  return `purchases/${purchaseId.toLowerCase()}`;
}

// A file name inside one purchase's folder: no further folders, nothing that climbs out.
const FILE_IN_FOLDER = /^[A-Za-z0-9._-]+$/;

/** Whether `path` is a file directly in this purchase's folder (so a form cannot point at another purchase's file). */
export function isDocumentPathOf(purchaseId: string, path: string): boolean {
  const folder = `${documentFolder(purchaseId)}/`;
  if (!path.startsWith(folder)) return false;
  const name = path.slice(folder.length);
  return FILE_IN_FOLDER.test(name) && !name.startsWith(".");
}

/** The title a document gets when none was typed: its file name. */
export function defaultDocumentTitle(path: string): string {
  return displayName(path).slice(0, 200) || "Document";
}

const id = (message: string) => z.string({ error: message }).trim().regex(UUID_PATTERN, message);

const optionalCategory = z
  .string()
  .trim()
  .default("")
  .refine((value) => value === "" || UUID_PATTERN.test(value), "Choose a category from the list")
  .transform((value) => (value === "" ? null : value.toLowerCase()));

const BAD_PURCHASE_MESSAGE = "This purchase could not be found. Reload the page.";

/** The step of the purchase a document belongs to (hidden field of the step's form). */
const step = z.enum(PURCHASE_STEPS, { error: "This step could not be found. Reload the page." }).default("quotation");
export const CATEGORY_NAME_TAKEN_MESSAGE = "There is already a category with this name";
export const DOCUMENT_FILE_MESSAGE = "Choose the file to upload";

/** A new document: the file was uploaded from the browser first, and its path is posted. */
export const newDocumentSchema = z
  .object({
    purchase_id: id(BAD_PURCHASE_MESSAGE).transform((value) => value.toLowerCase()),
    stage: step,
    category_id: optionalCategory,
    file_path: z.string({ error: DOCUMENT_FILE_MESSAGE }).trim().min(1, DOCUMENT_FILE_MESSAGE),
    title: line("Title", 200),
    document_date: optionalDate,
    notes: paragraphs("Notes", 2000),
  })
  .superRefine((value, ctx) => {
    if (!isDocumentPathOf(value.purchase_id, value.file_path)) {
      ctx.addIssue({ code: "custom", path: ["file_path"], message: "Upload the file again." });
    }
  })
  .transform((value) => ({ ...value, title: value.title || defaultDocumentTitle(value.file_path) }));

/** Changes to a document. The file itself stays: to replace it, delete the document and upload the new file. */
export const documentUpdateSchema = z.object({
  purchase_id: id(BAD_PURCHASE_MESSAGE).transform((value) => value.toLowerCase()),
  stage: step,
  category_id: optionalCategory,
  title: line("Title", 200).refine((value) => value !== "", "Enter a title"),
  document_date: optionalDate,
  notes: paragraphs("Notes", 2000),
});

export const documentCategorySchema = z.object({
  name: line("Name", 80).refine((value) => value !== "", "Enter a name"),
  sort_order: z
    .string()
    .default("")
    .transform((value) => value.replace(/[\s,]/g, ""))
    .refine((value) => value === "" || /^-?\d{1,6}$/.test(value), "Enter a whole number, for example 10")
    .transform((value) => (value === "" ? 0 : Number(value))),
});

export type DocumentRow = {
  id: string;
  category_id: string | null;
  title: string;
  file_path: string;
  document_date: string | null;
  notes: string;
  created_at: string;
};

export type CategoryRow = { id: string; name: string; sort_order: number };

export type DocumentGroup = { category: CategoryRow | null; documents: DocumentRow[] };

/**
 * The documents filed by category, in the categories' order; documents without a category (or
 * whose category was deleted) come last. Empty categories are left out.
 */
export function groupDocuments(documents: DocumentRow[], categories: CategoryRow[]): DocumentGroup[] {
  const known = new Map(categories.map((category) => [category.id, category]));
  const groups: DocumentGroup[] = categories.map((category) => ({ category, documents: [] }));
  const byId = new Map(groups.map((group) => [group.category!.id, group]));
  const loose: DocumentRow[] = [];
  for (const document of documents) {
    const group = document.category_id && known.has(document.category_id) ? byId.get(document.category_id) : undefined;
    if (group) group.documents.push(document);
    else loose.push(document);
  }
  const filled = groups.filter((group) => group.documents.length > 0);
  return loose.length > 0 ? [...filled, { category: null, documents: loose }] : filled;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import {
  FORM_ERROR,
  NOT_FOUND_MESSAGE,
  failure,
  fromPgError,
  type ActionFailure,
  type ActionResult,
} from "./action-result";
import { UUID_PATTERN, parseForm } from "./schemas";

// The save and delete logic the entity actions share. Callers must have run requireAdmin()
// first and pass the client it returned: the admin's own session, so row level security is the
// real permission check.

const BAD_ID_MESSAGE = "This item could not be found. Reload the page and try again.";

// Errors that are the admin's or a race's doing and not a fault: a foreign key (an item deleted
// meanwhile), and a product the spec table RPC could not find.
const EXPECTED_ERROR_CODES = new Set(["23503", "P0002"]);

/** Maps a database error to form messages, logging the ones that are not an expected user mistake. */
export function dbFailure(error: unknown): ActionFailure {
  const result = fromPgError(error);
  const code = (error as { code?: unknown } | null)?.code;
  if (FORM_ERROR in result.errors && !(typeof code === "string" && EXPECTED_ERROR_CODES.has(code))) {
    console.error("Admin database error", error);
  }
  return result;
}

/** The row id posted by an edit form (hidden field): null for a new item, undefined when it is not an id. */
function postedId(form: FormData): string | null | undefined {
  const raw = form.get("id");
  if (raw === null || raw === "") return null;
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

type SaveOptions<S extends z.ZodType> = {
  supabase: SupabaseClient;
  table: string;
  form: FormData;
  schema: S;
  /** Where to go after creating an item. */
  listPath: string;
  /** Where to go after creating an item instead of the list, given the new id (for example its own edit screen). */
  afterCreatePath?: (id: string) => string;
  /** The columns to write; defaults to everything the schema returned. */
  toRow?: (data: z.output<S>) => Record<string, unknown>;
  /** Extra writes once the row is saved (link tables). A failure is returned after the site is refreshed. */
  afterSave?: (id: string, data: z.output<S>) => Promise<ActionResult>;
};

/**
 * Validates the form, inserts a new row or updates the one named by the hidden `id` field, runs
 * `afterSave`, refreshes the whole public site, and then either goes back to the list (new item)
 * or reports success (existing item). Anything wrong comes back as messages for the form.
 */
export async function saveEntity<S extends z.ZodType>(options: SaveOptions<S>): Promise<ActionResult> {
  const { supabase, table, form, schema, listPath, afterCreatePath, toRow, afterSave } = options;

  const parsed = parseForm(schema, form);
  if (!parsed.ok) return failure(parsed.errors);

  const id = postedId(form);
  if (id === undefined) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  const row = toRow ? toRow(parsed.data) : (parsed.data as Record<string, unknown>);

  let savedId: string;
  if (id) {
    // select("id") shows whether the row was there: an update of a deleted row changes nothing and is no error.
    const updated = await supabase.from(table).update(row).eq("id", id).select("id");
    if (updated.error) return dbFailure(updated.error);
    if (!updated.data || updated.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });
    savedId = id;
  } else {
    const inserted = await supabase.from(table).insert(row).select("id").single();
    if (inserted.error) return dbFailure(inserted.error);
    savedId = (inserted.data as { id?: string } | null)?.id ?? "";
  }

  const extra: ActionResult =
    afterSave && savedId ? await afterSave(savedId, parsed.data) : { ok: true };

  // The row is saved, so the public site must pick it up even if a follow-up write failed.
  revalidatePath("/", "layout");
  if (!extra.ok) return extra;

  if (!id) redirect(afterCreatePath && savedId ? afterCreatePath(savedId) : listPath);
  return { ok: true };
}

/** Deletes one row by id and refreshes the whole public site. */
export async function deleteEntity(options: {
  supabase: SupabaseClient;
  table: string;
  id: unknown;
}): Promise<ActionResult> {
  const { supabase, table, id } = options;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return dbFailure(error);

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Makes the links between one item and others (rows of a link table such as `project_products`
 * or `product_applications`) equal `wanted`. New links go in first and dropped ones come out
 * after, so a failure part-way never leaves the item with fewer links than before. Any failure
 * comes back as `failedMessage` (the database text is logged, never shown).
 */
export async function replaceLinks(options: {
  supabase: SupabaseClient;
  table: string;
  /** Column holding the id of the item being saved, and the column holding the ids it links to. */
  ownerColumn: string;
  otherColumn: string;
  ownerId: string;
  wanted: string[];
  failedMessage: string;
}): Promise<ActionResult> {
  const { supabase, table, ownerColumn, otherColumn, ownerId, wanted, failedMessage } = options;
  const failed = (error: unknown): ActionResult => {
    dbFailure(error); // logs it
    return failure({ [FORM_ERROR]: failedMessage });
  };

  const existing = await supabase.from(table).select(otherColumn).eq(ownerColumn, ownerId);
  if (existing.error) return failed(existing.error);

  const have = new Set((existing.data ?? []).map((link) => (link as unknown as Record<string, string>)[otherColumn]));
  const want = new Set(wanted);
  const toAdd = wanted.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));

  if (toAdd.length > 0) {
    const added = await supabase.from(table).insert(toAdd.map((id) => ({ [ownerColumn]: ownerId, [otherColumn]: id })));
    if (added.error) return failed(added.error);
  }
  if (toRemove.length > 0) {
    const removed = await supabase.from(table).delete().eq(ownerColumn, ownerId).in(otherColumn, toRemove);
    if (removed.error) return failed(removed.error);
  }
  return { ok: true };
}

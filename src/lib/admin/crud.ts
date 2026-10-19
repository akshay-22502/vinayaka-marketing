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

/** Maps a database error to form messages, logging the ones that are not an expected user mistake. */
export function dbFailure(error: unknown): ActionFailure {
  const result = fromPgError(error);
  if (FORM_ERROR in result.errors && (error as { code?: unknown } | null)?.code !== "23503") {
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
  const { supabase, table, form, schema, listPath, toRow, afterSave } = options;

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

  if (!id) redirect(listPath);
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FORM_ERROR, NOT_FOUND_MESSAGE, failure, type ActionResult } from "@/lib/admin/action-result";
import { buyerNoteSchema, buyerSchema, newBuyerSchema } from "@/lib/admin/buyers";
import { dbFailure } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, parseForm, parseInput } from "@/lib/admin/schemas";

// The wholesale buyers list. Everything runs with the admin's own session, so row level security is
// the real permission check. Only the admin buyer pages are refreshed: the public site shows nothing
// from these tables.

const BAD_ID_MESSAGE = "This buyer could not be found. Reload the page and try again.";

function refresh(id?: string): void {
  revalidatePath("/admin/buyers");
  if (id) revalidatePath(`/admin/buyers/${id}`);
}

/**
 * Creates a buyer (then opens its page, where notes are added), or saves the details of the one named
 * by the form's hidden `id`. The status of an existing buyer is not part of this form: it changes
 * through a note, so the log shows when.
 */
export async function saveBuyer(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const rawId = form.get("id");
  if (rawId === null || rawId === "") {
    const parsed = parseForm(newBuyerSchema, form);
    if (!parsed.ok) return failure(parsed.errors);
    const inserted = await supabase.from("wholesale_buyers").insert(parsed.data).select("id").single();
    if (inserted.error) return dbFailure(inserted.error);
    const id = (inserted.data as { id: string }).id;
    refresh();
    redirect(`/admin/buyers/${id}`);
  }

  if (typeof rawId !== "string" || !UUID_PATTERN.test(rawId)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });
  const parsed = parseForm(buyerSchema, form);
  if (!parsed.ok) return failure(parsed.errors);

  // select("id") shows whether the row was there: an update of a deleted row changes nothing and is no error.
  const updated = await supabase.from("wholesale_buyers").update(parsed.data).eq("id", rawId).select("id");
  if (updated.error) return dbFailure(updated.error);
  if (!updated.data || updated.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  refresh(rawId);
  return { ok: true };
}

/** Deletes a buyer and all of its notes. */
export async function deleteBuyer(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  const { error } = await supabase.from("wholesale_buyers").delete().eq("id", id);
  if (error) return dbFailure(error);

  refresh();
  return { ok: true };
}

/**
 * Adds a note to a buyer. When the form's status differs from the buyer's status at page load, the
 * note also records that status and a database trigger moves the buyer to it in the same insert.
 */
export async function addBuyerNote(buyerId: unknown, input: unknown): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  if (typeof buyerId !== "string" || !UUID_PATTERN.test(buyerId)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });
  const parsed = parseInput(buyerNoteSchema, input);
  if (!parsed.ok) return failure(parsed.errors);

  const { error } = await supabase.from("wholesale_buyer_notes").insert({ buyer_id: buyerId, ...parsed.data });
  if (error) {
    // The buyer was deleted in another window.
    if ((error as { code?: unknown }).code === "23503") return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });
    return dbFailure(error);
  }

  refresh(buyerId);
  return { ok: true };
}

/** Deletes one note. The buyer's status stays as it is. */
export async function deleteBuyerNote(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: "This note could not be found. Reload the page." });

  const deleted = await supabase.from("wholesale_buyer_notes").delete().eq("id", id).select("buyer_id");
  if (deleted.error) return dbFailure(deleted.error);

  const buyerId = (deleted.data?.[0] as { buyer_id?: string } | undefined)?.buyer_id;
  refresh(buyerId);
  return { ok: true };
}

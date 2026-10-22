"use server";

import { revalidatePath } from "next/cache";
import { CATEGORY_GONE_MESSAGE, FORM_ERROR, NOT_FOUND_MESSAGE, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure } from "@/lib/admin/crud";
import { DOCUMENTS_BUCKET, documentUpdateSchema, newDocumentSchema } from "@/lib/admin/documents";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, parseForm } from "@/lib/admin/schemas";

// The documents of a purchase. The browser uploads the file to the private purchase-documents
// bucket with the admin's session first; these actions then save, change or delete the row that
// files it. Row level security (and the bucket's policy) is the real permission check.

const BAD_DOCUMENT_MESSAGE = "This document could not be found. Reload the page and try again.";

function postedId(form: FormData): string | null | undefined {
  const raw = form.get("id");
  if (raw === null || raw === "") return null;
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

function foreignKeyFailure(error: unknown): ActionResult | null {
  if ((error as { code?: unknown } | null)?.code !== "23503") return null;
  const detail = `${(error as { message?: string }).message ?? ""} ${(error as { details?: string }).details ?? ""}`;
  // The category, or the purchase itself, was deleted in another window.
  if (/category_id/.test(detail)) return failure({ category_id: CATEGORY_GONE_MESSAGE });
  return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });
}

/** Files a newly uploaded document with a purchase, or saves the title, category, date and notes of the one named by `id`. */
export async function savePurchaseDocument(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const id = postedId(form);
  if (id === undefined) return failure({ [FORM_ERROR]: BAD_DOCUMENT_MESSAGE });

  if (id === null) {
    const parsed = parseForm(newDocumentSchema, form);
    if (!parsed.ok) return failure(parsed.errors);
    const inserted = await supabase.from("purchase_documents").insert(parsed.data).select("id");
    if (inserted.error) return foreignKeyFailure(inserted.error) ?? dbFailure(inserted.error);
    revalidatePath(`/admin/purchases/${parsed.data.purchase_id}`);
    return { ok: true };
  }

  const parsed = parseForm(documentUpdateSchema, form);
  if (!parsed.ok) return failure(parsed.errors);
  const { purchase_id: purchaseId, ...row } = parsed.data;
  // A document stays with the purchase it was added to.
  const updated = await supabase.from("purchase_documents").update(row).eq("id", id).eq("purchase_id", purchaseId).select("id");
  if (updated.error) return foreignKeyFailure(updated.error) ?? dbFailure(updated.error);
  if (!updated.data || updated.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  revalidatePath(`/admin/purchases/${purchaseId}`);
  return { ok: true };
}

/** Deletes a document and its file. */
export async function deletePurchaseDocument(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_DOCUMENT_MESSAGE });

  const deleted = await supabase.from("purchase_documents").delete().eq("id", id).select("purchase_id, file_path");
  if (deleted.error) return dbFailure(deleted.error);
  const row = deleted.data?.[0] as { purchase_id?: string; file_path?: string } | undefined;

  if (row?.file_path) {
    // The row is gone, so the document is deleted for the admin; a file left behind is only logged.
    const removed = await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.file_path]);
    if (removed.error) console.error("Could not delete a purchase document's file", removed.error);
  }
  if (row?.purchase_id) {
    revalidatePath(`/admin/purchases/${row.purchase_id}`);
  }
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FORM_ERROR, NOT_FOUND_MESSAGE, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure } from "@/lib/admin/crud";
import { DOCUMENTS_BUCKET } from "@/lib/admin/documents";
import { purchaseCostSchema, purchaseItemSchema, purchaseSchema } from "@/lib/admin/purchases";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, parseForm } from "@/lib/admin/schemas";

// Purchases from suppliers: the purchase itself, its product lines and its costs. Everything runs
// with the admin's own session, so row level security is the real permission check. Only admin
// pages are refreshed: the public site shows nothing from these tables.

const BAD_ID_MESSAGE = "This purchase could not be found. Reload the page and try again.";
const BAD_LINE_MESSAGE = "This line could not be found. Reload the page and try again.";
const PRODUCT_GONE_MESSAGE = "This product no longer exists. Choose another one.";

function refresh(id?: string): void {
  revalidatePath("/admin/purchases");
  if (id) revalidatePath(`/admin/purchases/${id}`);
  // A supplier's page lists its purchases.
  revalidatePath("/admin/suppliers", "layout");
}

/** The row id posted by an edit form (hidden field): null for a new row, undefined when it is not an id. */
function postedId(form: FormData): string | null | undefined {
  const raw = form.get("id");
  if (raw === null || raw === "") return null;
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
}

/** Creates a purchase (then opens its page, where products and costs are added), or saves the one named by `id`. */
export async function savePurchase(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const id = postedId(form);
  if (id === undefined) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });
  const parsed = parseForm(purchaseSchema, form);
  if (!parsed.ok) return failure(parsed.errors);

  if (id === null) {
    const inserted = await supabase.from("purchases").insert(parsed.data).select("id").single();
    if (inserted.error) return dbFailure(inserted.error);
    const newId = (inserted.data as { id: string }).id;
    refresh();
    redirect(`/admin/purchases/${newId}`);
  }

  // select("id") shows whether the row was there: an update of a deleted row changes nothing and is no error.
  const updated = await supabase.from("purchases").update(parsed.data).eq("id", id).select("id");
  if (updated.error) return dbFailure(updated.error);
  if (!updated.data || updated.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  refresh(id);
  return { ok: true };
}

/** Deletes a purchase with its products, costs and documents (their files too). */
export async function deletePurchase(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  // The document rows go with the purchase (on delete cascade); their files are removed after.
  const documents = await supabase.from("purchase_documents").select("file_path").eq("purchase_id", id);
  if (documents.error) return dbFailure(documents.error);

  const { error } = await supabase.from("purchases").delete().eq("id", id);
  if (error) return dbFailure(error);

  const paths = ((documents.data ?? []) as { file_path?: unknown }[])
    .map((row) => row.file_path)
    .filter((path): path is string => typeof path === "string" && path !== "");
  if (paths.length > 0) {
    const removed = await supabase.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (removed.error) console.error("Could not delete a purchase's document files", removed.error);
  }

  refresh();
  return { ok: true };
}

/**
 * Inserts or updates one line (product or cost) of a purchase. A line belongs to the purchase it was
 * added to: an update never moves it to another purchase.
 */
async function saveLine(
  table: "purchase_items" | "purchase_costs",
  form: FormData,
  schema: typeof purchaseItemSchema | typeof purchaseCostSchema,
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const id = postedId(form);
  if (id === undefined) return failure({ [FORM_ERROR]: BAD_LINE_MESSAGE });
  const parsed = parseForm(schema, form);
  if (!parsed.ok) return failure(parsed.errors);
  const { purchase_id: purchaseId, ...row } = parsed.data;

  const result =
    id === null
      ? await supabase.from(table).insert({ purchase_id: purchaseId, ...row }).select("id")
      : await supabase.from(table).update(row).eq("id", id).eq("purchase_id", purchaseId).select("id");
  if (result.error) {
    if ((result.error as { code?: unknown }).code === "23503") {
      const detail = `${(result.error as { message?: string }).message ?? ""} ${(result.error as { details?: string }).details ?? ""}`;
      // A catalogue product, or the purchase itself, was deleted in another window.
      if (/product_id/.test(detail)) return failure({ product_id: PRODUCT_GONE_MESSAGE });
      return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });
    }
    return dbFailure(result.error);
  }
  if (!result.data || result.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  refresh(purchaseId);
  return { ok: true };
}

/** Adds a product line to a purchase, or saves the one named by the form's hidden `id`. */
export async function savePurchaseItem(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return saveLine("purchase_items", form, purchaseItemSchema);
}

/** Adds a cost to a purchase, or saves the one named by the form's hidden `id`. */
export async function savePurchaseCost(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return saveLine("purchase_costs", form, purchaseCostSchema);
}

async function deleteLine(table: "purchase_items" | "purchase_costs", id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_LINE_MESSAGE });

  const deleted = await supabase.from(table).delete().eq("id", id).select("purchase_id");
  if (deleted.error) return dbFailure(deleted.error);

  refresh((deleted.data?.[0] as { purchase_id?: string } | undefined)?.purchase_id);
  return { ok: true };
}

/** Deletes one product line. */
export async function deletePurchaseItem(id: string): Promise<ActionResult> {
  return deleteLine("purchase_items", id);
}

/** Deletes one cost. */
export async function deletePurchaseCost(id: string): Promise<ActionResult> {
  return deleteLine("purchase_costs", id);
}

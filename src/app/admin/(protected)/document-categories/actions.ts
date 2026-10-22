"use server";

import { revalidatePath } from "next/cache";
import { FORM_ERROR, NOT_FOUND_MESSAGE, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure } from "@/lib/admin/crud";
import { CATEGORY_NAME_TAKEN_MESSAGE, documentCategorySchema } from "@/lib/admin/documents";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, parseForm } from "@/lib/admin/schemas";

// The categories purchase documents are filed under. Admin-only; the purchase pages show them.

const BAD_ID_MESSAGE = "This category could not be found. Reload the page and try again.";

function refresh(): void {
  revalidatePath("/admin/document-categories");
  revalidatePath("/admin/purchases", "layout");
}

/** Adds a category, or renames / reorders the one named by the form's hidden `id`. */
export async function saveDocumentCategory(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const raw = form.get("id");
  const id = raw === null || raw === "" ? null : typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : undefined;
  if (id === undefined) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });
  const parsed = parseForm(documentCategorySchema, form);
  if (!parsed.ok) return failure(parsed.errors);

  const result =
    id === null
      ? await supabase.from("document_categories").insert(parsed.data).select("id")
      : await supabase.from("document_categories").update(parsed.data).eq("id", id).select("id");
  if (result.error) {
    if ((result.error as { code?: unknown }).code === "23505") return failure({ name: CATEGORY_NAME_TAKEN_MESSAGE });
    return dbFailure(result.error);
  }
  if (!result.data || result.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  refresh();
  return { ok: true };
}

/** Deletes a category. Its documents stay, without a category. */
export async function deleteDocumentCategory(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  const { error } = await supabase.from("document_categories").delete().eq("id", id);
  if (error) return dbFailure(error);

  refresh();
  return { ok: true };
}

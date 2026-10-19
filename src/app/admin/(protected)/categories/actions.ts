"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import type { ActionResult } from "@/lib/admin/action-result";
import { deleteEntity, saveEntity } from "@/lib/admin/crud";
import { categorySchema } from "@/lib/admin/schemas";

/** Creates a category, or updates the one named by the form's hidden `id`. */
export async function saveCategory(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  // First: Server Actions are public endpoints, so every one checks for an admin itself.
  const { supabase } = await requireAdmin();
  return saveEntity({ supabase, table: "categories", form, schema: categorySchema, listPath: "/admin/categories" });
}

/** Deletes a category. The database refuses while products are still in it (the message says so). */
export async function deleteCategory(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return deleteEntity({ supabase, table: "categories", id });
}

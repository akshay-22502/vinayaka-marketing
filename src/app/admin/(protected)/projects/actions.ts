"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure, deleteEntity, saveEntity } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/admin/require-admin";
import { projectSchema } from "@/lib/admin/schemas";

const LINKS_FAILED_MESSAGE =
  "The project was saved, but its products could not be updated. Open the project again from the list and save once more.";

function linksFailed(error: unknown): ActionResult {
  dbFailure(error); // logs it
  return failure({ form: LINKS_FAILED_MESSAGE });
}

/**
 * Makes the project's product links equal `productIds`. New links go in first and dropped ones
 * come out after, so a failure part-way never leaves the project with fewer links than before.
 */
async function replaceProducts(supabase: SupabaseClient, projectId: string, productIds: string[]): Promise<ActionResult> {
  const existing = await supabase.from("project_products").select("product_id").eq("project_id", projectId);
  if (existing.error) return linksFailed(existing.error);

  const have = new Set((existing.data ?? []).map((link: { product_id: string }) => link.product_id));
  const want = new Set(productIds);
  const toAdd = productIds.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));

  if (toAdd.length > 0) {
    const added = await supabase
      .from("project_products")
      .insert(toAdd.map((product_id) => ({ project_id: projectId, product_id })));
    if (added.error) return linksFailed(added.error);
  }
  if (toRemove.length > 0) {
    const removed = await supabase
      .from("project_products")
      .delete()
      .eq("project_id", projectId)
      .in("product_id", toRemove);
    if (removed.error) return linksFailed(removed.error);
  }
  return { ok: true };
}

/**
 * Creates a project, or updates the one named by the form's hidden `id`, and then replaces its
 * product links (`project_products`) with the products ticked in the form.
 */
export async function saveProject(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return saveEntity({
    supabase,
    table: "projects",
    form,
    schema: projectSchema,
    listPath: "/admin/projects",
    // The linked products are not a column of projects.
    toRow: (data) => {
      const row: Record<string, unknown> = { ...data };
      delete row.product_ids;
      return row;
    },
    afterSave: (id, data) => replaceProducts(supabase, id, data.product_ids),
  });
}

/** Deletes a project (its product links go with it). */
export async function deleteProject(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return deleteEntity({ supabase, table: "projects", id });
}

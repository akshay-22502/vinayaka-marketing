"use server";

import { type ActionResult } from "@/lib/admin/action-result";
import { deleteEntity, replaceLinks, saveEntity } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/admin/require-admin";
import { projectSchema } from "@/lib/admin/schemas";

const LINKS_FAILED_MESSAGE =
  "The project was saved, but its products could not be updated. Open the project again from the list and save once more.";

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
    afterSave: (id, data) =>
      replaceLinks({
        supabase,
        table: "project_products",
        ownerColumn: "project_id",
        otherColumn: "product_id",
        ownerId: id,
        wanted: data.product_ids,
        failedMessage: LINKS_FAILED_MESSAGE,
      }),
  });
}

/** Deletes a project (its product links go with it). */
export async function deleteProject(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return deleteEntity({ supabase, table: "projects", id });
}

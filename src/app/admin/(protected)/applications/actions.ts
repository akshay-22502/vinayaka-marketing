"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import type { ActionResult } from "@/lib/admin/action-result";
import { deleteEntity, saveEntity } from "@/lib/admin/crud";
import { applicationSchema } from "@/lib/admin/schemas";

/** Creates an application, or updates the one named by the form's hidden `id`. */
export async function saveApplication(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return saveEntity({ supabase, table: "applications", form, schema: applicationSchema, listPath: "/admin/applications" });
}

/** Deletes an application (its links to products go with it). */
export async function deleteApplication(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return deleteEntity({ supabase, table: "applications", id });
}

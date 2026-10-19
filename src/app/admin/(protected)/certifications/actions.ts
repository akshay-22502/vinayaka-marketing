"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import type { ActionResult } from "@/lib/admin/action-result";
import { deleteEntity, saveEntity } from "@/lib/admin/crud";
import { certificationSchema } from "@/lib/admin/schemas";

/** Creates a certification, or updates the one named by the form's hidden `id`. */
export async function saveCertification(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return saveEntity({
    supabase,
    table: "certifications",
    form,
    schema: certificationSchema,
    listPath: "/admin/certifications",
  });
}

export async function deleteCertification(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return deleteEntity({ supabase, table: "certifications", id });
}

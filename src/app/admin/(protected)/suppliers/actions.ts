"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FORM_ERROR, NOT_FOUND_MESSAGE, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, parseForm } from "@/lib/admin/schemas";
import { supplierSchema } from "@/lib/admin/suppliers";

// The suppliers list. Everything runs with the admin's own session, so row level security is the
// real permission check. Only admin pages are refreshed: the public site shows nothing from here.

const BAD_ID_MESSAGE = "This supplier could not be found. Reload the page and try again.";

function refresh(id?: string): void {
  revalidatePath("/admin/suppliers");
  if (id) revalidatePath(`/admin/suppliers/${id}`);
  // Purchase pages show supplier names.
  revalidatePath("/admin/purchases", "layout");
}

/** Creates a supplier (then opens its page), or saves the one named by the form's hidden `id`. */
export async function saveSupplier(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const rawId = form.get("id");
  const parsed = parseForm(supplierSchema, form);

  if (rawId === null || rawId === "") {
    if (!parsed.ok) return failure(parsed.errors);
    const inserted = await supabase.from("suppliers").insert(parsed.data).select("id").single();
    if (inserted.error) return dbFailure(inserted.error);
    const id = (inserted.data as { id: string }).id;
    refresh();
    redirect(`/admin/suppliers/${id}`);
  }

  if (typeof rawId !== "string" || !UUID_PATTERN.test(rawId)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });
  if (!parsed.ok) return failure(parsed.errors);

  // select("id") shows whether the row was there: an update of a deleted row changes nothing and is no error.
  const updated = await supabase.from("suppliers").update(parsed.data).eq("id", rawId).select("id");
  if (updated.error) return dbFailure(updated.error);
  if (!updated.data || updated.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  refresh(rawId);
  return { ok: true };
}

/** Deletes a supplier. The database refuses while it has purchases, and the form says so. */
export async function deleteSupplier(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) return dbFailure(error);

  refresh();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { FORM_ERROR, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure, deleteEntity, replaceLinks, saveEntity } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, productSchema } from "@/lib/admin/schemas";
import { validateSpecGrid } from "@/lib/admin/spec-grid-schema";
import { toRpcPayload } from "@/lib/content/spec-grid";
import type { SpecGrid } from "@/lib/content/types";

const LINKS_FAILED_MESSAGE =
  "The product was saved, but its applications could not be updated. Open the product again from the list and save once more.";
const BAD_ID_MESSAGE = "This product could not be found. Reload the page and try again.";

/**
 * Creates a product, or updates the one named by the form's hidden `id`, and then makes its
 * application links (`product_applications`) equal the applications ticked in the form. After a
 * create, the new product's own screen opens so its spec table can be added.
 *
 * A product that is saved as published while its overview still carries the seeded "confirm
 * against the datasheet" reminder is not saved until the admin confirms (see productSchema).
 */
export async function saveProduct(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return saveEntity({
    supabase,
    table: "products",
    form,
    schema: productSchema,
    listPath: "/admin/products",
    afterCreatePath: (id) => `/admin/products/${id}?created=1`,
    // The linked applications and the publish confirmation are not columns of products.
    toRow: (data) => {
      const row: Record<string, unknown> = { ...data };
      delete row.application_ids;
      delete row.confirm_unverified;
      return row;
    },
    afterSave: (id, data) =>
      replaceLinks({
        supabase,
        table: "product_applications",
        ownerColumn: "product_id",
        otherColumn: "application_id",
        ownerId: id,
        wanted: data.application_ids,
        failedMessage: LINKS_FAILED_MESSAGE,
      }),
  });
}

/** Deletes a product. Its spec table, application links and project links go with it (the database cascades). */
export async function deleteProduct(id: string): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  return deleteEntity({ supabase, table: "products", id });
}

/**
 * Replaces a product's whole spec table with `grid` through the `save_spec_table` RPC, which
 * does it in one transaction: either every model, property and value is saved or nothing
 * changes. The grid is validated first (model codes non-empty and unique, property names
 * non-empty, length and size limits); problems come back keyed by position (`models.1`,
 * `rows.0.name`, ...) for the editor to mark. Database errors never reach the admin as text.
 */
export async function saveSpecGrid(productId: string, grid: SpecGrid): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  if (typeof productId !== "string" || !UUID_PATTERN.test(productId)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });

  const parsed = validateSpecGrid(grid);
  if (!parsed.ok) return failure(parsed.errors);

  try {
    const { error } = await supabase.rpc("save_spec_table", { p_product_id: productId, p_grid: toRpcPayload(parsed.data) });
    if (error) return dbFailure(error);
  } catch (thrown) {
    return dbFailure(thrown);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

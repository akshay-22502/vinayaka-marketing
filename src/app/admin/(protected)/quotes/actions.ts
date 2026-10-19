"use server";

import { revalidatePath } from "next/cache";
import { FORM_ERROR, NOT_FOUND_MESSAGE, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure } from "@/lib/admin/crud";
import { quoteUpdateSchema } from "@/lib/admin/quote-update-schema";
import { requireAdmin } from "@/lib/admin/require-admin";
import { UUID_PATTERN, parseInput } from "@/lib/admin/schemas";

const BAD_ID_MESSAGE = "This quote request could not be found. Reload the page and try again.";

/**
 * Saves the status and the admin's notes of one quote request. This is all an admin can change: the
 * request itself (what the buyer wrote, the attachment, whether the email went out) is never edited,
 * and there is no delete in v1 (a request that is dealt with is marked Closed).
 *
 * Runs with the admin's own session, so row level security is the real permission check. It refreshes
 * only the admin quote pages: the public site shows nothing from a quote request.
 */
export async function updateQuote(id: unknown, input: unknown): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return failure({ [FORM_ERROR]: BAD_ID_MESSAGE });
  const parsed = parseInput(quoteUpdateSchema, input);
  if (!parsed.ok) return failure(parsed.errors);

  // select("id") shows whether the row was there: an update of a deleted row changes nothing and is no error.
  const updated = await supabase
    .from("quote_requests")
    .update({ status: parsed.data.status, admin_notes: parsed.data.adminNotes })
    .eq("id", id)
    .select("id");
  if (updated.error) return dbFailure(updated.error);
  if (!updated.data || updated.data.length === 0) return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });

  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${id}`);
  return { ok: true };
}

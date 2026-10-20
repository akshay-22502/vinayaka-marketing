"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { FORM_ERROR, failure, type ActionResult } from "@/lib/admin/action-result";
import { dbFailure } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/admin/require-admin";
import { parseForm } from "@/lib/admin/schemas";
import { settingsSchema, type SettingsInput } from "@/lib/admin/settings-schema";
import type { Country } from "@/lib/content/types";

const RECIPIENTS_FAILED_MESSAGE =
  "The office details and texts were saved, but the quote recipient emails could not be saved. Please try again.";

/**
 * Makes the `quote_recipients` table match the form: a country with an address gets (or keeps) a row,
 * a country left blank loses its row. A country without a row is a supported state: its quotes are
 * still saved, nobody is emailed, and the inbox flags them "Email not sent".
 */
async function saveRecipients(
  supabase: SupabaseClient,
  recipients: SettingsInput["recipients"],
): Promise<ActionResult> {
  const countries = Object.keys(recipients) as Country[];
  const wanted = countries.flatMap((country) => {
    const email = recipients[country];
    return email ? [{ country, email }] : [];
  });
  const blank = countries.filter((country) => !recipients[country]);

  if (wanted.length > 0) {
    const { error } = await supabase.from("quote_recipients").upsert(wanted, { onConflict: "country" });
    if (error) {
      dbFailure(error); // logs it
      return failure({ [FORM_ERROR]: RECIPIENTS_FAILED_MESSAGE });
    }
  }
  if (blank.length > 0) {
    const { error } = await supabase.from("quote_recipients").delete().in("country", blank);
    if (error) {
      dbFailure(error);
      return failure({ [FORM_ERROR]: RECIPIENTS_FAILED_MESSAGE });
    }
  }
  return { ok: true };
}

/**
 * Saves the site-wide texts and office details (the one `site_settings` row) and the quote recipient
 * email of each country. Runs with the admin's own session, so row level security is the real
 * permission check. The two writes are not one transaction: if only the recipients fail, the texts are
 * already saved, the public site is refreshed, and the form says which part failed.
 */
export async function saveSettings(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const parsed = parseForm(settingsSchema, form);
  if (!parsed.ok) return failure(parsed.errors);
  const { settings, recipients } = parsed.data;

  // An upsert, so a missing row (the migration always creates it) could not make a save silently do nothing.
  const saved = await supabase.from("site_settings").upsert({ id: 1, ...settings }, { onConflict: "id" }).select("id");
  if (saved.error) return dbFailure(saved.error);

  const recipientsResult = await saveRecipients(supabase, recipients);

  // The footer, contact, about and home pages all read the settings.
  revalidatePath("/", "layout");
  return recipientsResult;
}

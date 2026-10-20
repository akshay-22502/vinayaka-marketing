"use client";

import { useCallback } from "react";
import type { ActionResult } from "@/lib/admin/action-result";
import { QUOTE_STATUSES } from "@/lib/admin/quote-filters";
import { ADMIN_NOTES_MAX, QUOTE_STATUS_LABELS } from "@/lib/admin/quote-view";
import { EntityForm } from "./EntityForm";
import { Field } from "./Field";

type Props = {
  id: string;
  status: string;
  adminNotes: string | null;
  /** Changes with every save, so the fields show what was stored. */
  updatedAt: string;
  /** The updateQuote Server Action. */
  update: (id: string, input: { status: string; adminNotes: string }) => Promise<ActionResult>;
};

const STATUS_OPTIONS = QUOTE_STATUSES.map((status) => ({ value: status, label: QUOTE_STATUS_LABELS[status] }));

/**
 * The status and notes of one quote request. It is the shared admin form shell (messages next to the
 * fields, focus on the first problem, "Saved."), with a small adapter from the posted form to the
 * `updateQuote(id, { status, adminNotes })` call.
 */
export function QuoteReviewForm({ id, status, adminNotes, updatedAt, update }: Props) {
  const action = useCallback(
    (_previous: ActionResult | null, form: FormData) =>
      update(id, { status: String(form.get("status") ?? ""), adminNotes: String(form.get("adminNotes") ?? "") }),
    [id, update],
  );

  return (
    <EntityForm action={action} listHref="/admin/quotes">
      <div key={updatedAt} className="space-y-6">
        <Field label="Status" name="status" type="select" options={STATUS_OPTIONS} defaultValue={status} />
        <Field
          label="Admin notes"
          name="adminNotes"
          type="textarea"
          rows={6}
          maxLength={ADMIN_NOTES_MAX}
          defaultValue={adminNotes}
          hint="Only your team sees these notes. The buyer never does."
        />
      </div>
    </EntityForm>
  );
}

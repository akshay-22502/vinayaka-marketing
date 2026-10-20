"use client";

import { useCallback } from "react";
import type { ActionResult } from "@/lib/admin/action-result";
import { BUYER_NOTE_MAX, BUYER_STATUSES, BUYER_STATUS_LABELS } from "@/lib/admin/buyers";
import { EntityForm } from "./EntityForm";
import { Field } from "./Field";

type Props = {
  buyerId: string;
  /** The buyer's status now; the form starts on it, and a different choice is recorded on the note. */
  status: string;
  /** The addBuyerNote Server Action. */
  add: (buyerId: string, input: { status: string; currentStatus: string; body: string }) => Promise<ActionResult>;
};

const STATUS_OPTIONS = BUYER_STATUSES.map((status) => ({ value: status, label: BUYER_STATUS_LABELS[status] }));

/**
 * "Add an update" on a buyer's page: a note, a new status, or both. The page gives it a new key after
 * every saved note, so it comes back empty, set to the buyer's new status.
 */
export function BuyerNoteForm({ buyerId, status, add }: Props) {
  const action = useCallback(
    (_previous: ActionResult | null, form: FormData) =>
      add(buyerId, { status: String(form.get("status") ?? ""), currentStatus: status, body: String(form.get("body") ?? "") }),
    [buyerId, status, add],
  );

  return (
    <EntityForm action={action} listHref="/admin/buyers" submitLabel="Add update">
      <div className="space-y-6">
        <Field
          label="Status"
          name="status"
          type="select"
          options={STATUS_OPTIONS}
          defaultValue={status}
          hint="Change it when the buyer moves to a new step. The change is recorded with the date."
        />
        <Field
          label="Note"
          name="body"
          type="textarea"
          rows={4}
          maxLength={BUYER_NOTE_MAX}
          spellCheck
          hint="For example: Called the purchase manager, sending samples next week."
        />
      </div>
    </EntityForm>
  );
}

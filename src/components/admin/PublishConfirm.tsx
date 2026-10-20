"use client";

import { useId, useState } from "react";
import { PUBLISH_CONFIRM_FIELD } from "@/lib/admin/action-result";
import { useFormErrors } from "./EntityForm";

/**
 * The second confirmation for publishing a product whose overview still contains the seeded
 * "confirm against the datasheet" reminder (Ruling R9). It is not shown until a save has been
 * refused for that reason; then it appears with the explanation, takes focus (EntityForm focuses
 * the first invalid control), and stays for the rest of the editing session so that a different
 * error on the next save does not make the tick vanish. Ticking it posts `confirm_unverified`.
 */
export function PublishConfirm() {
  const error = useFormErrors()[PUBLISH_CONFIRM_FIELD];
  const [shown, setShown] = useState(false);
  const id = useId();
  const errorId = `${id}-error`;

  if (error && !shown) setShown(true);
  if (!shown) return null;

  return (
    <div className="rounded-md border border-amber-500 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          name="confirm_unverified"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-navy"
        />
        <div>
          <label htmlFor={id} className="block text-base font-semibold text-slate-900">
            Publish anyway, with the datasheet reminder still in the overview
          </label>
          {error ? (
            <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-red-800">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { FORM_ERROR, type ActionResult } from "@/lib/admin/action-result";

type Props = {
  id: string;
  /** What the item is called, for the confirmation question. */
  name: string;
  /** "category", "application", ... Used in the button text. */
  noun: string;
  /** The delete Server Action. */
  action: (id: string) => Promise<ActionResult>;
  /** The list page to go to after the item is gone. */
  listHref: string;
};

/**
 * Deleting is a two-step control: "Delete <noun>" asks "Delete <name>? This cannot be undone." and
 * only "Yes, delete" runs the action. Focus starts on Cancel so a stray Enter does not delete. If the
 * database refuses (a category that still has products) the reason is shown here and nothing changes.
 */
export function DeleteButton({ id, name, noun, action, listHref }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  function cancel() {
    setConfirming(false);
    setError(null);
    // The button that opened the question is back; return focus to it.
    requestAnimationFrame(() => openRef.current?.focus());
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        router.push(listHref);
        return;
      }
      setError(result.errors[FORM_ERROR] ?? Object.values(result.errors)[0] ?? "Could not delete. Please try again.");
    });
  }

  return (
    <div className="mt-12 border-t border-slate-200 pt-6">
      <form onSubmit={onSubmit} className="space-y-3">
        {confirming ? (
          <>
            <p className="text-base font-semibold text-slate-900">
              Delete {name}? This cannot be undone.
            </p>
            {error ? (
              <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={pending}
                className="btn bg-red-700 text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-70"
              >
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
              <button ref={cancelRef} type="button" onClick={cancel} disabled={pending} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            ref={openRef}
            type="button"
            onClick={() => setConfirming(true)}
            className="btn border border-red-700 bg-white text-red-800 hover:bg-red-50"
          >
            Delete {noun}
          </button>
        )}
      </form>
    </div>
  );
}

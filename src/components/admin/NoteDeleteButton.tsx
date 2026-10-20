"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FORM_ERROR, type ActionResult } from "@/lib/admin/action-result";

/**
 * A small two-step delete for one note (or another line, named by `noun`): "Delete" asks "Delete this
 * note?" and only "Yes, delete" runs the action. Focus starts on Cancel so a stray Enter does not delete.
 */
export function NoteDeleteButton({
  id,
  action,
  noun = "note",
}: {
  id: string;
  action: (id: string) => Promise<ActionResult>;
  noun?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.errors[FORM_ERROR] ?? "Could not delete. Please try again.");
    });
  }

  const small = "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold";

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${small} text-red-800 hover:bg-red-50`}>
        Delete<span className="sr-only"> {noun}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-slate-900">Delete this {noun}?</span>
      <button type="button" onClick={remove} disabled={pending} className={`${small} bg-red-700 text-white hover:bg-red-800 disabled:opacity-70`}>
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button ref={cancelRef} type="button" onClick={() => setConfirming(false)} disabled={pending} className={`${small} border border-slate-300 bg-white text-slate-800`}>
        Cancel
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

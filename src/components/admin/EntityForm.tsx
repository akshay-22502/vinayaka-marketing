"use client";

import Link from "next/link";
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { FORM_ERROR, type ActionResult } from "@/lib/admin/action-result";

const NO_ERRORS: Record<string, string> = {};
const FormErrorsContext = createContext<Record<string, string>>(NO_ERRORS);

/** The messages the last save returned, by field name. Used by Field, MediaUpload and the other form parts. */
export function useFormErrors(): Record<string, string> {
  return useContext(FormErrorsContext);
}

type Props = {
  /** The save Server Action. */
  action: (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;
  /** Id of the item being edited; leave out when creating. Posted as a hidden `id` field. */
  id?: string;
  /** The list page: where Cancel goes. */
  listHref: string;
  submitLabel?: string;
  children: ReactNode;
};

const UPLOADING_MESSAGE = "A file is still uploading. Wait for it to finish, then save.";

/**
 * Shell for an admin edit form. It posts the form to the save action, then shows what came back:
 * a message next to each field that has one (Field reads them from here), a message for the whole
 * form, or "Saved.". After a failed save it moves focus to the first field with a problem.
 *
 * The form is submitted from onSubmit and not through the `action` prop on purpose: React resets
 * a form after an action and would wipe what the admin typed whenever a field has an error.
 */
export function EntityForm({ action, id, listHref, submitLabel = "Save", children }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = state && !state.ok ? state.errors : NO_ERRORS;
  const formError = localError ?? errors[FORM_ERROR] ?? null;

  useEffect(() => {
    if (!state || state.ok) return;
    const form = formRef.current;
    const target =
      form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>("[data-form-error]");
    target?.focus();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // Saving now would leave out the file that is still on its way.
    if (form.querySelector('[data-uploading="true"]')) {
      setLocalError(UPLOADING_MESSAGE);
      return;
    }
    setLocalError(null);
    const data = new FormData(form);
    startTransition(() => formAction(data));
  }

  return (
    <FormErrorsContext.Provider value={errors}>
      <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={pending} className="space-y-6">
        {id ? <input type="hidden" name="id" value={id} /> : null}

        {formError ? (
          <p
            role="alert"
            tabIndex={-1}
            data-form-error=""
            className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          >
            {formError}
          </p>
        ) : null}

        {children}

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
          <button type="submit" disabled={pending} className="btn btn-primary disabled:cursor-wait disabled:opacity-70">
            {pending ? "Saving…" : submitLabel}
          </button>
          <Link href={listHref} className="btn btn-secondary">
            Cancel
          </Link>
          <p role="status" className="text-sm font-semibold text-green-800">
            {!pending && state?.ok ? "Saved." : ""}
          </p>
        </div>
      </form>
    </FormErrorsContext.Provider>
  );
}

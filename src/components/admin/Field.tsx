"use client";

import { useId, type ReactNode } from "react";
import { useFormErrors } from "./EntityForm";

export const controlClass =
  "mt-1.5 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm placeholder:text-slate-500 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-600";

type Option = { value: string; label: string };

type Props = {
  label: string;
  /** The form field name; also where the message of a failed save is looked up. */
  name: string;
  type?: "text" | "textarea" | "select" | "date" | "email" | "tel";
  defaultValue?: string | number | null;
  hint?: string;
  required?: boolean;
  /** A message to show instead of the one the last save returned for this field. */
  error?: string;
  rows?: number;
  maxLength?: number;
  options?: Option[];
  inputMode?: "numeric" | "text" | "email" | "tel";
  placeholder?: string;
  spellCheck?: boolean;
};

/**
 * Label, control, hint and error message for one form field. The error comes from the last
 * save (see EntityForm) and sits right under the control, in a live region; the control is
 * marked invalid and described by it, so a screen reader reads it with the field.
 */
export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  hint,
  required,
  error: errorOverride,
  rows = 4,
  maxLength,
  options,
  inputMode,
  placeholder,
  spellCheck,
}: Props) {
  const errors = useFormErrors();
  const error = errorOverride ?? errors[name];
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const shared = {
    id,
    name,
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined,
    className: controlClass,
  };
  const value = defaultValue === null || defaultValue === undefined ? "" : String(defaultValue);

  let control: ReactNode;
  if (type === "textarea") {
    control = <textarea {...shared} rows={rows} maxLength={maxLength} defaultValue={value} spellCheck={spellCheck} />;
  } else if (type === "select") {
    control = (
      <select {...shared} defaultValue={value}>
        {(options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        {...shared}
        type={type}
        maxLength={maxLength}
        defaultValue={value}
        inputMode={inputMode}
        placeholder={placeholder}
        spellCheck={spellCheck}
        autoComplete="off"
      />
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-1">
        <label htmlFor={id} className="text-sm font-semibold text-slate-800">
          {label}
        </label>
        {required ? (
          <span aria-hidden="true" className="text-sm font-semibold text-red-700">
            *
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-slate-600">
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

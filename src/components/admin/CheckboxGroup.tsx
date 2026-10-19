"use client";

import { useFormErrors } from "./EntityForm";

type Option = { value: string; label: string };

type Props = {
  legend: string;
  /** Form field name, repeated once per ticked box. */
  name: string;
  options: Option[];
  /** The values ticked when the form first appears. */
  selected: string[];
  hint?: string;
  emptyMessage?: string;
};

/**
 * A list of checkboxes for linking an item to several others (a project's products). Each box
 * posts its value under `name`; the server compares the ticked set with what is stored.
 */
export function CheckboxGroup({ legend, name, options, selected, hint, emptyMessage = "Nothing to choose from yet." }: Props) {
  const error = useFormErrors()[name];
  const chosen = new Set(selected);

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-800">{legend}</legend>
      {hint ? <p className="mt-0.5 text-sm text-slate-600">{hint}</p> : null}
      {options.length > 0 ? (
        <ul className="mt-2 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-300 bg-white">
          {options.map((option) => (
            <li key={option.value}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                <input
                  type="checkbox"
                  name={name}
                  value={option.value}
                  defaultChecked={chosen.has(option.value)}
                  className="size-5 shrink-0 accent-navy"
                />
                <span className="min-w-0 break-words">{option.label}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-600">{emptyMessage}</p>
      )}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

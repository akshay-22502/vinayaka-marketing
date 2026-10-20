"use client";

import { useId, useState } from "react";
import { Markdown } from "@/components/site/Markdown";
import { controlClass } from "./Field";
import { useFormErrors } from "./EntityForm";

type Props = {
  label: string;
  name: string;
  defaultValue?: string | null;
  hint?: string;
  rows?: number;
  maxLength?: number;
  /** Names the preview for screen readers, for example "Preview of the overview". */
  previewLabel: string;
};

const tabClass =
  "min-h-11 px-4 text-sm font-semibold aria-pressed:bg-navy aria-pressed:text-white aria-[pressed=false]:bg-white aria-[pressed=false]:text-slate-800 aria-[pressed=false]:hover:bg-slate-100";

/**
 * A Markdown textarea with a Write / Preview switch. The textarea stays in the page while the
 * preview is shown (hidden, not removed), so the form still posts what was typed. The preview is
 * the same renderer the website uses: raw HTML is shown as text, not run.
 */
export function MarkdownField({ label, name, defaultValue, hint, rows = 12, maxLength, previewLabel }: Props) {
  const [text, setText] = useState(defaultValue ?? "");
  const [mode, setMode] = useState<"write" | "preview">("write");
  const error = useFormErrors()[name];
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold text-slate-800">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-slate-600">
          {hint}
        </p>
      ) : null}

      <div role="group" aria-label={`${label}: write or preview`} className="mt-2 inline-flex overflow-hidden rounded-md border border-slate-300">
        <button type="button" aria-pressed={mode === "write"} onClick={() => setMode("write")} className={tabClass}>
          Write
        </button>
        <button type="button" aria-pressed={mode === "preview"} onClick={() => setMode("preview")} className={`${tabClass} border-l border-slate-300`}>
          Preview
        </button>
      </div>

      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        value={text}
        onChange={(event) => setText(event.target.value)}
        hidden={mode === "preview"}
        spellCheck
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className={controlClass}
      />

      {mode === "preview" ? (
        <div role="region" aria-label={previewLabel} className="mt-1.5 min-h-24 rounded-md border border-slate-300 bg-white p-4">
          {text.trim() ? <Markdown>{text}</Markdown> : <p className="text-sm text-slate-600">Nothing to preview yet.</p>}
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

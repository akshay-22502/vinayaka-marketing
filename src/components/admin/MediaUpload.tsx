"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { publicMediaUrl } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, checkUpload, displayName, isImagePath, newUuid, uploadPath } from "@/lib/admin/upload";
import { useFormErrors } from "./EntityForm";

type Props = {
  /** Storage bucket; the admin's session needs write access to it (public-media has an admin policy). */
  bucket: string;
  /** Folder inside the bucket. The file is stored as `<folder>/<uuid>-<slugified file name>`. */
  folder: string;
  /** The stored path now, or null for none. Only read when the component first appears. */
  value: string | null;
  /** The file types the picker offers, as for `<input accept>` (for example "image/png,image/jpeg"). */
  accept: string;
  /** Name of the hidden input that carries the stored path into the form. */
  name: string;
  /** What the field is called, for the label and the buttons. */
  label: string;
  hint?: string;
  /** Show the Remove button. A list that has its own remove control turns it off. */
  removable?: boolean;
  maxBytes?: number;
  /** Called with the new path (or null after Remove). */
  onChange?: (path: string | null) => void;
};

/**
 * Upload one file from the browser straight to Supabase Storage, with the signed-in admin's
 * session, and put its path into a hidden input so the form saves it. Shows a preview for an
 * image or the file name for anything else (a PDF). A file that is refused or fails to upload
 * is reported right here, next to this field. Replacing or removing a file does not delete the
 * old object from storage: unused files are left behind (acceptable for v1).
 */
export function MediaUpload({
  bucket,
  folder,
  value,
  accept,
  name,
  label,
  hint,
  removable = true,
  maxBytes = MAX_UPLOAD_BYTES,
  onChange,
}: Props) {
  const [path, setPath] = useState(value ?? "");
  const [uploading, setUploading] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const fieldError = useFormErrors()[name];
  const error = problem ?? fieldError ?? null;

  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared so that choosing the same file again later still fires a change.
    input.value = "";
    if (!file) return;

    const refusal = checkUpload(file, accept, maxBytes);
    if (refusal) {
      setProblem(refusal);
      return;
    }

    setProblem(null);
    setUploading(file.name);
    try {
      const target = uploadPath(folder, file.name, newUuid());
      const { error: uploadError } = await getBrowserClient()
        .storage.from(bucket)
        .upload(target, file, { contentType: file.type || undefined, cacheControl: "31536000", upsert: false });
      if (uploadError) {
        setProblem(`Could not upload "${file.name}": ${uploadError.message}`);
        return;
      }
      setPath(target);
      onChange?.(target);
    } catch (thrown) {
      setProblem(`Could not upload "${file.name}": ${thrown instanceof Error ? thrown.message : "unknown error"}`);
    } finally {
      setUploading(null);
    }
  }

  function remove() {
    setPath("");
    setProblem(null);
    onChange?.(null);
    inputRef.current?.focus();
  }

  const url = path ? publicMediaUrl(path) : null;

  return (
    <div data-uploading={uploading ? "true" : undefined}>
      <input type="hidden" name={name} value={path} />
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-0.5 text-sm text-slate-600">
          {hint}
        </p>
      ) : null}

      {path && url ? (
        <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
          {isImagePath(path) ? (
            // A plain <img>: the admin preview needs no optimisation, and the file may be any size.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-20 shrink-0 rounded border border-slate-200 bg-white object-contain" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8 shrink-0 text-navy" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M7 3h7l5 5v13H7zM14 3v5h5" strokeLinejoin="round" />
            </svg>
          )}
          <div className="min-w-0 flex-1">
            <p className="break-all text-sm font-medium text-slate-900">{displayName(path)}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-navy underline underline-offset-4"
            >
              Open file<span className="sr-only"> ({label}, opens in a new tab)</span>
            </a>
          </div>
          {removable ? (
            <button
              type="button"
              onClick={remove}
              className="min-h-11 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Remove<span className="sr-only"> {label.toLowerCase()}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={uploading !== null}
        onChange={onFileChosen}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        className="mt-2 block w-full text-sm text-slate-700 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-navy file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-navy hover:file:bg-slate-100"
      />
      <p aria-live="polite" className="mt-1 text-sm text-slate-600">
        {uploading ? `Uploading ${uploading}…` : ""}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

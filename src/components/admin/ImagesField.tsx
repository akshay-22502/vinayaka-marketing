"use client";

import { useRef, useState } from "react";
import { MediaUpload } from "./MediaUpload";
import { useFormErrors } from "./EntityForm";
import { IMAGE_ACCEPT } from "@/lib/admin/upload";

type Row = { key: number; path: string };

type Props = {
  /** Form field name, repeated once per image. The images are saved in the order shown. */
  name?: string;
  /** Folder in the public-media bucket. */
  folder: string;
  /** The images saved so far, in order. Only read when the component first appears. */
  initial: string[];
  max?: number;
};

const buttonClass =
  "min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-white";

/**
 * Several images for one item (a project's photos): one upload row each, with buttons to add a
 * row, remove it, or move it up or down. The first image is the cover. Each row posts its stored
 * path as a repeated `name` field, in the order shown; empty rows are ignored by the server.
 */
export function ImagesField({ name = "images", folder, initial, max = 20 }: Props) {
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((path, key) => ({ key, path })));
  const error = useFormErrors()[name];

  function add() {
    setRows((current) => [...current, { key: nextKey.current++, path: "" }]);
  }

  function remove(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function move(index: number, by: -1 | 1) {
    setRows((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-slate-800">Images</legend>
      <p className="mt-0.5 text-sm text-slate-600">The first image is the cover. Use the arrows to change the order.</p>

      {rows.length > 0 ? (
        <ol className="mt-3 space-y-4">
          {rows.map((row, index) => (
            <li key={row.key} className="rounded-md border border-slate-200 p-3">
              <MediaUpload
                bucket="public-media"
                folder={folder}
                value={row.path || null}
                accept={IMAGE_ACCEPT}
                name={name}
                label={`Image ${index + 1}`}
                removable={false}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className={buttonClass}
                >
                  Move image {index + 1} up
                </button>
                <button
                  type="button"
                  aria-disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                  className={buttonClass}
                >
                  Move image {index + 1} down
                </button>
                <button type="button" onClick={() => remove(row.key)} className={buttonClass}>
                  Remove image {index + 1}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <button
        type="button"
        onClick={rows.length >= max ? undefined : add}
        aria-disabled={rows.length >= max}
        className={`${buttonClass} mt-3`}
      >
        Add image
      </button>
      {error ? (
        <p role="alert" className="mt-1.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

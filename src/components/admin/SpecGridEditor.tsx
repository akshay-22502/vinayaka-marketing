"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionResult } from "@/lib/admin/action-result";
import {
  addColumn,
  addRow,
  cellFieldId,
  columnFieldId,
  gridFromState,
  mapServerErrors,
  moveColumn,
  moveRow,
  removeColumn,
  removeRow,
  rowFieldId,
  setCell,
  setColumnCode,
  setRowText,
  stateFromGrid,
  type EditorState,
  type MappedErrors,
  type RowField,
} from "@/lib/admin/spec-editor-state";
import { SPEC_LIMITS } from "@/lib/admin/spec-limits";
import type { SpecGrid } from "@/lib/content/types";

type Props = {
  /** The stored table. Only read when the editor first appears. */
  initial: SpecGrid;
  /** Saves the whole table; resolves only once the database has answered. */
  onSave: (grid: SpecGrid) => Promise<ActionResult>;
};

const NO_PROBLEMS: MappedErrors = { fields: {}, general: [] };
const LEAVE_MESSAGE = "You have unsaved changes to the specification table. Leave this page and lose them?";
const FIRST_PROBLEM = ":first-problem";

const inputClass =
  "block w-full min-h-11 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-600";
const headCell = "border-b border-slate-300 bg-slate-100 px-2 py-2.5 align-top text-left";
const bodyCell = "border-b border-slate-200 bg-white px-2 py-2 align-top";
// First column: pinned while scrolling sideways. Opaque, or the cells scrolling underneath show through.
const pinned = "sticky left-0 z-10 w-44 min-w-44 sm:w-64 sm:min-w-64";

function IconButton({
  label,
  glyph,
  focusId,
  disabled,
  danger,
  onClick,
}: {
  label: string;
  glyph: string;
  focusId: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  // aria-disabled and not disabled: the button keeps keyboard focus when it reaches the end of its range.
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      data-focus={focusId}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md border bg-white text-base font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${
        danger ? "border-red-300 text-red-800 hover:bg-red-50" : "border-slate-300 text-slate-800 hover:bg-slate-100"
      }`}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/**
 * A spreadsheet-style editor for a product's spec table: models are the columns, properties the
 * rows, and every cell is an input. Models and properties can be added, removed and moved; the
 * table is saved as a whole.
 *
 * Saving is not optimistic: "Saved." appears only after `onSave` has come back with success, and
 * a refusal is shown at once with the inputs that are wrong marked. While there are unsaved edits
 * the page asks before it is left (closing or reloading the tab, and links inside the admin).
 */
export function SpecGridEditor({ initial, onSave }: Props) {
  const [state, setState] = useState<EditorState>(() => stateFromGrid(initial));
  // What is stored, as the editor sees it: the table that was last loaded or saved.
  const [baseline, setBaseline] = useState(() => JSON.stringify(gridFromState(stateFromGrid(initial))));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [problems, setProblems] = useState<MappedErrors>(NO_PROBLEMS);
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<string | null>(null);
  const leavingRef = useRef(false);

  const dirty = useMemo(() => JSON.stringify(gridFromState(state)) !== baseline, [state, baseline]);

  // Moves focus where an edit just happened (the DOM nodes are re-ordered, which can drop focus).
  useEffect(() => {
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    const root = rootRef.current;
    if (!root) return;
    const element =
      target === FIRST_PROBLEM
        ? (root.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root.querySelector<HTMLElement>("[data-grid-error]"))
        : root.querySelector<HTMLElement>(`[data-focus="${target}"]`);
    element?.focus();
  });

  // Unsaved edits: ask before the page is left.
  useEffect(() => {
    if (!dirty) return;
    leavingRef.current = false;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      event.preventDefault();
      event.returnValue = ""; // some browsers only ask when this is set
    };
    // Links inside the admin are client-side navigations, which never fire beforeunload.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // a full page load: beforeunload asks
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (window.confirm(LEAVE_MESSAGE)) {
        leavingRef.current = true; // a plain link would otherwise be asked about twice
      } else {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const { columns, rows } = state;
  const modelRef = (index: number) => columns[index].code.trim() || String(index + 1);
  const propertyRef = (index: number) => rows[index].name.trim() || String(index + 1);
  const modelLabel = (index: number) => columns[index].code.trim() || `Model ${index + 1}`;
  const propertyLabel = (index: number) => rows[index].name.trim() || `Property ${index + 1}`;

  /** Applies an edit. Anything typed or moved makes "Saved." stale, so it goes. */
  function edit(change: (current: EditorState) => EditorState) {
    setJustSaved(false);
    setState(change);
  }

  function clearProblem(id: string) {
    setProblems((current) => {
      if (!(id in current.fields)) return current;
      const fields = { ...current.fields };
      delete fields[id];
      return { ...current, fields };
    });
  }

  /** A duplicate model code involves two columns, so fixing one clears the marks on all model codes. */
  function clearModelProblems() {
    setProblems((current) => {
      const fields = Object.fromEntries(Object.entries(current.fields).filter(([id]) => !id.startsWith("col:")));
      return Object.keys(fields).length === Object.keys(current.fields).length ? current : { ...current, fields };
    });
  }

  function onAddModel() {
    if (columns.length >= SPEC_LIMITS.models) return;
    focusRef.current = `col-code:${state.nextKey}`;
    setAnnouncement(`Added model ${columns.length + 1}. Type its code.`);
    edit(addColumn);
  }

  function onAddProperty() {
    if (rows.length >= SPEC_LIMITS.rows) return;
    focusRef.current = `row-name:${state.nextKey}`;
    setAnnouncement(`Added property ${rows.length + 1}. Type its name.`);
    edit(addRow);
  }

  function onRemoveModel(index: number) {
    const column = columns[index];
    focusRef.current = "add-model";
    setAnnouncement(`Removed model ${modelRef(index)}.`);
    clearModelProblems();
    edit((current) => removeColumn(current, column.key));
  }

  function onRemoveProperty(index: number) {
    const row = rows[index];
    focusRef.current = "add-property";
    setAnnouncement(`Removed property ${propertyRef(index)}.`);
    edit((current) => removeRow(current, row.key));
  }

  function onMoveModel(index: number, by: -1 | 1) {
    const column = columns[index];
    focusRef.current = `${by === -1 ? "col-left" : "col-right"}:${column.key}`;
    setAnnouncement(`Moved model ${modelRef(index)} to position ${index + by + 1} of ${columns.length}.`);
    edit((current) => moveColumn(current, column.key, by));
  }

  function onMoveProperty(index: number, by: -1 | 1) {
    const row = rows[index];
    focusRef.current = `${by === -1 ? "row-up" : "row-down"}:${row.key}`;
    setAnnouncement(`Moved property ${propertyRef(index)} to position ${index + by + 1} of ${rows.length}.`);
    edit((current) => moveRow(current, row.key, by));
  }

  async function save() {
    if (saving) return;
    const sent = state;
    const grid = gridFromState(sent);
    setSaving(true);
    setJustSaved(false);
    setProblems(NO_PROBLEMS);

    let result: ActionResult;
    try {
      result = await onSave(grid);
    } catch {
      result = { ok: false, errors: { form: "Could not reach the server. Check your connection and try again." } };
    }

    if (result.ok) {
      // Only now is the table stored; edits made while it was saving stay unsaved.
      setBaseline(JSON.stringify(grid));
      setJustSaved(true);
      setSaving(false);
      return;
    }
    focusRef.current = FIRST_PROBLEM;
    setProblems(mapServerErrors(result.errors, sent));
    setSaving(false);
  }

  /** Where a marked input is, in words, for the list of problems (positions as they are now). */
  function describe(id: string): string | null {
    const [kind, first, second] = id.split(":");
    if (kind === "col") {
      const index = columns.findIndex((column) => String(column.key) === first);
      return index === -1 ? null : `Model ${index + 1}${columns[index].code.trim() ? ` (${columns[index].code.trim()})` : ""}`;
    }
    const rowIndex = rows.findIndex((row) => String(row.key) === first);
    if (rowIndex === -1) return null;
    const property = `Property ${rowIndex + 1}${rows[rowIndex].name.trim() ? ` (${rows[rowIndex].name.trim()})` : ""}`;
    if (kind === "row") return `${property}, ${second === "testMethod" ? "test method" : second}`;
    const columnIndex = columns.findIndex((column) => String(column.key) === second);
    return columnIndex === -1 ? null : `${property}, ${modelLabel(columnIndex)}`;
  }

  const problemList = [
    ...Object.entries(problems.fields).flatMap(([id, message]) => {
      const where = describe(id);
      return where ? [`${where}: ${message}`] : [];
    }),
    ...problems.general,
  ];

  const invalid = (id: string) => (problems.fields[id] ? true : undefined);
  const statusText = saving ? "Saving…" : dirty ? "Unsaved changes" : justSaved ? "Saved." : "No unsaved changes";
  const empty = columns.length === 0 && rows.length === 0;
  const textInput = (field: RowField, index: number, label: string) => (
    <input
      type="text"
      aria-label={label}
      aria-invalid={invalid(rowFieldId(rows[index].key, field))}
      value={rows[index][field]}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        const text = event.target.value;
        const key = rows[index].key;
        clearProblem(rowFieldId(key, field));
        edit((current) => setRowText(current, key, field, text));
      }}
      className={inputClass}
    />
  );

  return (
    <div ref={rootRef} data-testid="spec-grid-editor">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-focus="add-model"
          aria-disabled={columns.length >= SPEC_LIMITS.models || undefined}
          onClick={onAddModel}
          className="btn btn-secondary aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          Add model
        </button>
        <button
          type="button"
          data-focus="add-property"
          aria-disabled={rows.length >= SPEC_LIMITS.rows || undefined}
          onClick={onAddProperty}
          className="btn btn-secondary aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          Add property
        </button>
        {dirty ? (
          <span aria-hidden="true" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <span className="size-2.5 rounded-full bg-amber-600" />
            Unsaved
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Models (such as BX1515) are the columns and properties (such as Tensile strength) are the rows. Leave a cell empty when a
        model has no value; the website shows a dash. Up to {SPEC_LIMITS.models} models and {SPEC_LIMITS.rows} properties.
      </p>

      {problemList.length > 0 ? (
        <div
          role="alert"
          tabIndex={-1}
          data-grid-error=""
          className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">The table was not saved.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {problemList.map((text, index) => (
              <li key={`${index}-${text}`}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {empty ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
          This product has no specification table yet. Add a model (a column) and a property (a row) to start. A product
          without a table shows &ldquo;being prepared&rdquo; on the website.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Specification table editor (scrolls sideways)"
          tabIndex={0}
          className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white"
        >
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">
              Specification table. Each row is a property and each column is a model. Every cell can be edited.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={`${headCell} ${pinned} text-xs font-semibold uppercase tracking-wide text-slate-700 shadow-[1px_0_0_0_var(--color-slate-300)]`}>
                  Property
                </th>
                <th scope="col" className={`${headCell} min-w-24 text-xs font-semibold uppercase tracking-wide text-slate-700`}>
                  Unit
                </th>
                <th scope="col" className={`${headCell} min-w-36 text-xs font-semibold uppercase tracking-wide text-slate-700`}>
                  Test method
                </th>
                {columns.map((column, index) => (
                  <th key={column.key} scope="col" className={`${headCell} min-w-44`}>
                    <input
                      type="text"
                      data-focus={`col-code:${column.key}`}
                      aria-label={`Model ${index + 1} code`}
                      aria-invalid={invalid(columnFieldId(column.key))}
                      placeholder="e.g. BX1515"
                      value={column.code}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        const code = event.target.value;
                        clearModelProblems();
                        edit((current) => setColumnCode(current, column.key, code));
                      }}
                      className={`${inputClass} font-semibold`}
                    />
                    <div className="mt-1.5 flex gap-1">
                      <IconButton
                        label={`Move model ${modelRef(index)} left`}
                        glyph="←"
                        focusId={`col-left:${column.key}`}
                        disabled={index === 0}
                        onClick={() => onMoveModel(index, -1)}
                      />
                      <IconButton
                        label={`Move model ${modelRef(index)} right`}
                        glyph="→"
                        focusId={`col-right:${column.key}`}
                        disabled={index === columns.length - 1}
                        onClick={() => onMoveModel(index, 1)}
                      />
                      <IconButton
                        label={`Remove model ${modelRef(index)}`}
                        glyph="✕"
                        focusId={`col-remove:${column.key}`}
                        danger
                        onClick={() => onRemoveModel(index)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3 + columns.length} className={`${bodyCell} text-slate-600`}>
                    No properties yet. Use &ldquo;Add property&rdquo; to add the first row.
                  </td>
                </tr>
              ) : null}
              {rows.map((row, rowIndex) => (
                <tr key={row.key}>
                  <th scope="row" className={`${bodyCell} ${pinned} text-left font-normal shadow-[1px_0_0_0_var(--color-slate-200)]`}>
                    <input
                      type="text"
                      data-focus={`row-name:${row.key}`}
                      aria-label={`Property ${rowIndex + 1} name`}
                      aria-invalid={invalid(rowFieldId(row.key, "name"))}
                      placeholder="e.g. Tensile strength"
                      value={row.name}
                      autoComplete="off"
                      onChange={(event) => {
                        const name = event.target.value;
                        clearProblem(rowFieldId(row.key, "name"));
                        edit((current) => setRowText(current, row.key, "name", name));
                      }}
                      className={`${inputClass} font-medium`}
                    />
                    <div className="mt-1.5 flex gap-1">
                      <IconButton
                        label={`Move property ${propertyRef(rowIndex)} up`}
                        glyph="↑"
                        focusId={`row-up:${row.key}`}
                        disabled={rowIndex === 0}
                        onClick={() => onMoveProperty(rowIndex, -1)}
                      />
                      <IconButton
                        label={`Move property ${propertyRef(rowIndex)} down`}
                        glyph="↓"
                        focusId={`row-down:${row.key}`}
                        disabled={rowIndex === rows.length - 1}
                        onClick={() => onMoveProperty(rowIndex, 1)}
                      />
                      <IconButton
                        label={`Remove property ${propertyRef(rowIndex)}`}
                        glyph="✕"
                        focusId={`row-remove:${row.key}`}
                        danger
                        onClick={() => onRemoveProperty(rowIndex)}
                      />
                    </div>
                  </th>
                  <td className={bodyCell}>{textInput("unit", rowIndex, `${propertyLabel(rowIndex)} – unit`)}</td>
                  <td className={bodyCell}>{textInput("testMethod", rowIndex, `${propertyLabel(rowIndex)} – test method`)}</td>
                  {columns.map((column, columnIndex) => {
                    const id = cellFieldId(row.key, column.key);
                    return (
                      <td key={column.key} className={bodyCell}>
                        <input
                          type="text"
                          aria-label={`${modelLabel(columnIndex)} – ${propertyLabel(rowIndex)}`}
                          aria-invalid={invalid(id)}
                          value={row.cells[column.key] ?? ""}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(event) => {
                            const text = event.target.value;
                            clearProblem(id);
                            edit((current) => setCell(current, row.key, column.key, text));
                          }}
                          className={`${inputClass} tabular-nums`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary disabled:cursor-wait disabled:opacity-70">
          Save specification table
        </button>
        <p role="status" className={`text-sm font-semibold ${dirty ? "text-amber-800" : justSaved ? "text-green-800" : "text-slate-700"}`}>
          {statusText}
        </p>
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

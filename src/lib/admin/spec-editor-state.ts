import type { SpecGrid } from "@/lib/content/types";

// The state behind <SpecGridEditor>, as plain functions so the edits can be unit-tested without a
// browser. Every function returns a new state and leaves the one it was given alone.
//
// Columns (models) and rows (properties) each carry a `key` that never changes and is never
// reused. A cell is stored on its row under the key of its column, so moving or removing a column
// only changes the column list: the values stay with their model, and a column added later starts
// blank even if a removed one once had its position. Errors from the server are attached to keys
// as well, so a mark stays on the right input when the admin moves things around.

export type EditorColumn = { key: number; code: string };
export type EditorRow = {
  key: number;
  name: string;
  unit: string;
  testMethod: string;
  /** Cell text by column key. A missing entry is a blank cell. */
  cells: Record<number, string>;
};
export type EditorState = { columns: EditorColumn[]; rows: EditorRow[]; nextKey: number };

export type RowField = "name" | "unit" | "testMethod";

export function stateFromGrid(grid: SpecGrid): EditorState {
  let key = 0;
  const columns = grid.models.map((code) => ({ key: key++, code }));
  const rows = grid.rows.map((row) => ({
    key: key++,
    name: row.name,
    unit: row.unit ?? "",
    testMethod: row.testMethod ?? "",
    cells: Object.fromEntries(columns.map((column, index) => [column.key, row.values[index] ?? ""])),
  }));
  return { columns, rows, nextKey: key };
}

const blankToNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

/** The grid the state stands for: texts trimmed, a blank unit, test method or cell as null. */
export function gridFromState(state: EditorState): SpecGrid {
  return {
    models: state.columns.map((column) => column.code.trim()),
    rows: state.rows.map((row) => ({
      name: row.name.trim(),
      unit: blankToNull(row.unit),
      testMethod: blankToNull(row.testMethod),
      values: state.columns.map((column) => blankToNull(row.cells[column.key] ?? "")),
    })),
  };
}

export function addColumn(state: EditorState): EditorState {
  return { ...state, columns: [...state.columns, { key: state.nextKey, code: "" }], nextKey: state.nextKey + 1 };
}

export function addRow(state: EditorState): EditorState {
  const row: EditorRow = { key: state.nextKey, name: "", unit: "", testMethod: "", cells: {} };
  return { ...state, rows: [...state.rows, row], nextKey: state.nextKey + 1 };
}

export function removeColumn(state: EditorState, key: number): EditorState {
  return {
    ...state,
    columns: state.columns.filter((column) => column.key !== key),
    // The values of the removed model go with it.
    rows: state.rows.map((row) => {
      const cells = { ...row.cells };
      delete cells[key];
      return { ...row, cells };
    }),
  };
}

export function removeRow(state: EditorState, key: number): EditorState {
  return { ...state, rows: state.rows.filter((row) => row.key !== key) };
}

function moved<T extends { key: number }>(items: T[], key: number, by: -1 | 1): T[] | null {
  const from = items.findIndex((item) => item.key === key);
  const to = from + by;
  if (from === -1 || to < 0 || to >= items.length) return null;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Moves a model one place left (-1) or right (1). Returns the same state when it cannot move. */
export function moveColumn(state: EditorState, key: number, by: -1 | 1): EditorState {
  const columns = moved(state.columns, key, by);
  return columns ? { ...state, columns } : state;
}

/** Moves a property one place up (-1) or down (1). Returns the same state when it cannot move. */
export function moveRow(state: EditorState, key: number, by: -1 | 1): EditorState {
  const rows = moved(state.rows, key, by);
  return rows ? { ...state, rows } : state;
}

export function setColumnCode(state: EditorState, key: number, code: string): EditorState {
  return { ...state, columns: state.columns.map((column) => (column.key === key ? { ...column, code } : column)) };
}

export function setRowText(state: EditorState, key: number, field: RowField, text: string): EditorState {
  return { ...state, rows: state.rows.map((row) => (row.key === key ? { ...row, [field]: text } : row)) };
}

export function setCell(state: EditorState, rowKey: number, columnKey: number, text: string): EditorState {
  return {
    ...state,
    rows: state.rows.map((row) => (row.key === rowKey ? { ...row, cells: { ...row.cells, [columnKey]: text } } : row)),
  };
}

// Errors ------------------------------------------------------------------------

/** Ids of the inputs an error can belong to. */
export const columnFieldId = (columnKey: number) => `col:${columnKey}`;
export const rowFieldId = (rowKey: number, field: RowField) => `row:${rowKey}:${field}`;
export const cellFieldId = (rowKey: number, columnKey: number) => `cell:${rowKey}:${columnKey}`;

export type MappedErrors = {
  /** Message by input id (see columnFieldId, rowFieldId, cellFieldId). */
  fields: Record<string, string>;
  /** Messages that belong to no single input, in the order received. */
  general: string[];
};

/**
 * Matches the server's errors (keyed `models.<i>`, `rows.<i>.name`, `rows.<i>.values.<j>`, ...) to
 * the inputs of the state that was sent. Anything else, or a position that does not exist, is
 * returned as a general message.
 */
export function mapServerErrors(errors: Record<string, string>, sent: EditorState): MappedErrors {
  const fields: Record<string, string> = {};
  const general: string[] = [];

  for (const [key, message] of Object.entries(errors)) {
    let id: string | null = null;

    const model = /^models\.(\d+)$/.exec(key);
    const property = /^rows\.(\d+)\.(name|unit|testMethod)$/.exec(key);
    const value = /^rows\.(\d+)\.values\.(\d+)$/.exec(key);
    if (model) {
      const column = sent.columns[Number(model[1])];
      if (column) id = columnFieldId(column.key);
    } else if (property) {
      const row = sent.rows[Number(property[1])];
      if (row) id = rowFieldId(row.key, property[2] as RowField);
    } else if (value) {
      const row = sent.rows[Number(value[1])];
      const column = sent.columns[Number(value[2])];
      if (row && column) id = cellFieldId(row.key, column.key);
    }

    if (id) fields[id] = message;
    else general.push(message);
  }
  return { fields, general };
}

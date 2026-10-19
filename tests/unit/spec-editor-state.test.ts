import { describe, expect, it } from "vitest";
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
} from "@/lib/admin/spec-editor-state";
import type { SpecGrid } from "@/lib/content/types";

// The logic behind <SpecGridEditor>: the edits (add, remove, move, type) and how the server's
// errors are matched to inputs. The component itself is exercised in tests/e2e/admin-product.spec.ts.

const GRID: SpecGrid = {
  models: ["BX1515", "BX2020", "BX3030"],
  rows: [
    { name: "Tensile strength", unit: "kN/m", testMethod: "ASTM D6637", values: ["15", "20", "30"] },
    { name: "Colour", unit: null, testMethod: null, values: ["Black", null, "Grey"] },
  ],
};

const keyOfColumn = (state: ReturnType<typeof stateFromGrid>, code: string) =>
  state.columns.find((column) => column.code === code)!.key;
const keyOfRow = (state: ReturnType<typeof stateFromGrid>, name: string) => state.rows.find((row) => row.name === name)!.key;

describe("stateFromGrid / gridFromState", () => {
  it("round-trips a grid, null cells included", () => {
    expect(gridFromState(stateFromGrid(GRID))).toEqual(GRID);
  });

  it("round-trips an empty grid", () => {
    expect(gridFromState(stateFromGrid({ models: [], rows: [] }))).toEqual({ models: [], rows: [] });
  });

  it("gives every column and row its own key", () => {
    const state = stateFromGrid(GRID);
    const keys = [...state.columns.map((c) => c.key), ...state.rows.map((r) => r.key)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(state.nextKey).toBeGreaterThan(Math.max(...keys));
  });

  it("trims text and turns blank unit, test method and cells into null when making the grid", () => {
    let state = stateFromGrid({ models: ["A"], rows: [{ name: "S", unit: null, testMethod: null, values: [null] }] });
    state = setColumnCode(state, state.columns[0].key, "  BX1  ");
    state = setRowText(state, state.rows[0].key, "name", "  Strength ");
    state = setRowText(state, state.rows[0].key, "unit", "   ");
    state = setCell(state, state.rows[0].key, state.columns[0].key, "  12 ");
    expect(gridFromState(state)).toEqual({
      models: ["BX1"],
      rows: [{ name: "Strength", unit: null, testMethod: null, values: ["12"] }],
    });
  });
});

describe("columns (models)", () => {
  it("adds a blank model at the end, with an empty cell in every row", () => {
    const state = addColumn(stateFromGrid(GRID));
    expect(gridFromState(state)).toEqual({
      models: ["BX1515", "BX2020", "BX3030", ""],
      rows: [
        { ...GRID.rows[0], values: ["15", "20", "30", null] },
        { ...GRID.rows[1], values: ["Black", null, "Grey", null] },
      ],
    });
  });

  it("types a code and a cell for the new model", () => {
    let state = addColumn(stateFromGrid(GRID));
    const added = state.columns[3].key;
    state = setColumnCode(state, added, "BX5050");
    state = setCell(state, keyOfRow(state, "Tensile strength"), added, "50");
    expect(gridFromState(state)).toMatchObject({
      models: ["BX1515", "BX2020", "BX3030", "BX5050"],
      rows: [{ values: ["15", "20", "30", "50"] }, { values: ["Black", null, "Grey", null] }],
    });
  });

  it("moves a model left or right and takes its values with it", () => {
    const state = stateFromGrid(GRID);
    const right = moveColumn(state, keyOfColumn(state, "BX1515"), 1);
    expect(gridFromState(right)).toEqual({
      models: ["BX2020", "BX1515", "BX3030"],
      rows: [
        { ...GRID.rows[0], values: ["20", "15", "30"] },
        { ...GRID.rows[1], values: [null, "Black", "Grey"] },
      ],
    });
    const left = moveColumn(right, keyOfColumn(right, "BX3030"), -1);
    expect(gridFromState(left).models).toEqual(["BX2020", "BX3030", "BX1515"]);
    expect(gridFromState(left).rows[0].values).toEqual(["20", "30", "15"]);
  });

  it("does nothing when a model cannot move further", () => {
    const state = stateFromGrid(GRID);
    expect(moveColumn(state, keyOfColumn(state, "BX1515"), -1)).toBe(state);
    expect(moveColumn(state, keyOfColumn(state, "BX3030"), 1)).toBe(state);
    expect(moveColumn(state, 9999, 1)).toBe(state);
  });

  it("removes a model with its values and keeps the others lined up", () => {
    const state = stateFromGrid(GRID);
    const next = removeColumn(state, keyOfColumn(state, "BX2020"));
    expect(gridFromState(next)).toEqual({
      models: ["BX1515", "BX3030"],
      rows: [
        { ...GRID.rows[0], values: ["15", "30"] },
        { ...GRID.rows[1], values: ["Black", "Grey"] },
      ],
    });
  });

  it("does not reuse the key of a removed model for a model added later", () => {
    let state = stateFromGrid(GRID);
    const removedKey = keyOfColumn(state, "BX3030");
    state = removeColumn(state, removedKey);
    state = addColumn(state);
    expect(state.columns.map((c) => c.key)).not.toContain(removedKey);
    // The new column starts blank, so no value of the removed one reappears.
    expect(gridFromState(state).rows[0].values).toEqual(["15", "20", null]);
  });

  it("changes nothing in the state it was given", () => {
    const state = stateFromGrid(GRID);
    const snapshot = structuredClone(state);
    removeColumn(state, state.columns[0].key);
    moveColumn(state, state.columns[0].key, 1);
    addColumn(state);
    setCell(state, state.rows[0].key, state.columns[0].key, "x");
    expect(state).toEqual(snapshot);
  });
});

describe("rows (properties)", () => {
  it("adds a blank property at the end, with an empty cell for every model", () => {
    const grid = gridFromState(addRow(stateFromGrid(GRID)));
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[2]).toEqual({ name: "", unit: null, testMethod: null, values: [null, null, null] });
  });

  it("moves a property up or down", () => {
    const state = stateFromGrid(GRID);
    const down = moveRow(state, keyOfRow(state, "Tensile strength"), 1);
    expect(gridFromState(down).rows.map((r) => r.name)).toEqual(["Colour", "Tensile strength"]);
    const up = moveRow(down, keyOfRow(down, "Tensile strength"), -1);
    expect(gridFromState(up)).toEqual(GRID);
  });

  it("does nothing when a property cannot move further", () => {
    const state = stateFromGrid(GRID);
    expect(moveRow(state, keyOfRow(state, "Tensile strength"), -1)).toBe(state);
    expect(moveRow(state, keyOfRow(state, "Colour"), 1)).toBe(state);
  });

  it("removes a property", () => {
    const state = stateFromGrid(GRID);
    expect(gridFromState(removeRow(state, keyOfRow(state, "Tensile strength"))).rows.map((r) => r.name)).toEqual(["Colour"]);
  });

  it("edits the name, unit and test method of one property only", () => {
    let state = stateFromGrid(GRID);
    const key = keyOfRow(state, "Colour");
    state = setRowText(state, key, "name", "Colour of the yarn");
    state = setRowText(state, key, "unit", "-");
    state = setRowText(state, key, "testMethod", "Visual");
    expect(gridFromState(state).rows).toEqual([
      GRID.rows[0],
      { name: "Colour of the yarn", unit: "-", testMethod: "Visual", values: ["Black", null, "Grey"] },
    ]);
  });
});

describe("mapServerErrors", () => {
  const state = stateFromGrid(GRID);
  const [m0, m1] = state.columns.map((c) => c.key);
  const [r0, r1] = state.rows.map((r) => r.key);

  it("matches errors by position to the column, row and cell they belong to", () => {
    const mapped = mapServerErrors(
      {
        "models.1": "Enter a model code",
        "rows.0.name": "Enter a property name",
        "rows.1.unit": "Too long",
        "rows.1.testMethod": "Too long too",
        "rows.1.values.0": "Remove line breaks",
      },
      state,
    );
    expect(mapped.fields).toEqual({
      [columnFieldId(m1)]: "Enter a model code",
      [rowFieldId(r0, "name")]: "Enter a property name",
      [rowFieldId(r1, "unit")]: "Too long",
      [rowFieldId(r1, "testMethod")]: "Too long too",
      [cellFieldId(r1, m0)]: "Remove line breaks",
    });
    expect(mapped.general).toEqual([]);
  });

  it("keeps the match when the admin moves things afterwards (it uses keys, not positions)", () => {
    const mapped = mapServerErrors({ "models.0": "Duplicate" }, state);
    const moved = moveColumn(state, m0, 1);
    expect(moved.columns[1].key).toBe(m0);
    expect(mapped.fields[columnFieldId(m0)]).toBe("Duplicate");
  });

  it("lists table-wide and unknown errors as general messages", () => {
    const mapped = mapServerErrors(
      { grid: "A table can have up to 30 models", form: "Could not save. Please try again.", "rows.9.name": "Outside", other: "?" },
      state,
    );
    expect(mapped.fields).toEqual({});
    expect(mapped.general).toEqual([
      "A table can have up to 30 models",
      "Could not save. Please try again.",
      "Outside",
      "?",
    ]);
  });
});

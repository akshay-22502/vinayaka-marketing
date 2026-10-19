import { describe, expect, it } from "vitest";
import { SPEC_LIMITS } from "@/lib/admin/spec-limits";
import {
  GRID_MALFORMED_MESSAGE,
  MODEL_REQUIRED_MESSAGE,
  PROPERTY_REQUIRED_MESSAGE,
  duplicateModelMessage,
  validateSpecGrid,
} from "@/lib/admin/spec-grid-schema";
import type { SpecGrid } from "@/lib/content/types";

// Rules for the grid the spec editor sends to saveSpecGrid. Errors are keyed by position so the
// editor can mark the right input: models.<i>, rows.<i>.name|unit|testMethod, rows.<i>.values.<j>,
// and `grid` for a problem with the table as a whole.

function row(name: string, values: (string | null)[], unit: string | null = null, testMethod: string | null = null) {
  return { name, unit, testMethod, values };
}

function errorsOf(input: unknown): Record<string, string> {
  const result = validateSpecGrid(input);
  if (result.ok) throw new Error("Expected the grid to be rejected");
  return result.errors;
}

function dataOf(input: unknown): SpecGrid {
  const result = validateSpecGrid(input);
  if (!result.ok) throw new Error(`Expected a valid grid, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

describe("validateSpecGrid: what is accepted", () => {
  it("accepts a normal grid and returns it unchanged", () => {
    const grid: SpecGrid = {
      models: ["BX1515", "BX2020"],
      rows: [row("Tensile strength", ["15", "20"], "kN/m", "ASTM D6637"), row("Colour", ["Black", null])],
    };
    expect(dataOf(grid)).toEqual(grid);
  });

  it("accepts an empty table: no models and no rows (clears the table)", () => {
    expect(dataOf({ models: [], rows: [] })).toEqual({ models: [], rows: [] });
  });

  it("accepts properties with no models, and models with no properties", () => {
    expect(dataOf({ models: [], rows: [row("Strength", [])] }).rows).toHaveLength(1);
    expect(dataOf({ models: ["A"], rows: [] }).models).toEqual(["A"]);
  });

  it("trims every text and turns blank unit, test method and values into null", () => {
    const data = dataOf({
      models: ["  BX1515  "],
      rows: [{ name: "  Tensile strength ", unit: "  ", testMethod: " ASTM D6637 ", values: ["   "] }, row("Mass", ["  150 "], "g/m²")],
    });
    expect(data).toEqual({
      models: ["BX1515"],
      rows: [
        { name: "Tensile strength", unit: null, testMethod: "ASTM D6637", values: [null] },
        { name: "Mass", unit: "g/m²", testMethod: null, values: ["150"] },
      ],
    });
  });

  it("accepts the same value in several models, and the same property name twice", () => {
    expect(dataOf({ models: ["A", "B"], rows: [row("Colour", ["Black", "Black"]), row("Colour", ["x", "x"])] }).rows).toHaveLength(2);
  });

  it("keeps symbols and non-Latin text in values (≥, ×, Hindi)", () => {
    const data = dataOf({ models: ["A"], rows: [row("Strength", ["≥ 93 × 2 भारत"], "kN/m")] });
    expect(data.rows[0].values[0]).toBe("≥ 93 × 2 भारत");
  });

  it("accepts a model code at the length limit and a table at the size limit", () => {
    expect(dataOf({ models: ["m".repeat(SPEC_LIMITS.modelCode)], rows: [] }).models[0]).toHaveLength(SPEC_LIMITS.modelCode);
    const models = Array.from({ length: SPEC_LIMITS.models }, (_, i) => `M${i}`);
    const rows = Array.from({ length: SPEC_LIMITS.rows }, (_, i) => row(`Property ${i}`, models.map(() => "1")));
    expect(dataOf({ models, rows }).rows).toHaveLength(SPEC_LIMITS.rows);
  });
});

describe("validateSpecGrid: model codes", () => {
  it("rejects duplicate model codes [BX1515, BX1515] and marks both columns", () => {
    const errors = errorsOf({ models: ["BX1515", "BX1515"], rows: [] });
    expect(Object.keys(errors).sort()).toEqual(["models.0", "models.1"]);
    expect(errors["models.0"]).toBe(duplicateModelMessage("BX1515"));
    expect(errors["models.1"]).toBe(duplicateModelMessage("BX1515"));
    expect(duplicateModelMessage("BX1515")).toMatch(/BX1515/);
  });

  it("treats codes that differ only in case or surrounding spaces as duplicates", () => {
    expect(Object.keys(errorsOf({ models: ["BX1515", "bx1515"], rows: [] })).sort()).toEqual(["models.0", "models.1"]);
    expect(Object.keys(errorsOf({ models: ["BX1515", "  BX1515 "], rows: [] })).sort()).toEqual(["models.0", "models.1"]);
  });

  it("only marks the columns that clash, not the others", () => {
    const errors = errorsOf({ models: ["A", "B", "a", "C"], rows: [] });
    expect(Object.keys(errors).sort()).toEqual(["models.0", "models.2"]);
  });

  it("rejects an empty or blank model code", () => {
    expect(errorsOf({ models: ["BX1515", ""], rows: [] })).toEqual({ "models.1": MODEL_REQUIRED_MESSAGE });
    expect(errorsOf({ models: ["   "], rows: [] })).toEqual({ "models.0": MODEL_REQUIRED_MESSAGE });
    expect(errorsOf({ models: [" "], rows: [] })).toEqual({ "models.0": MODEL_REQUIRED_MESSAGE });
  });

  it("does not call two blank codes duplicates: each just needs a code", () => {
    expect(errorsOf({ models: ["", ""], rows: [] })).toEqual({
      "models.0": MODEL_REQUIRED_MESSAGE,
      "models.1": MODEL_REQUIRED_MESSAGE,
    });
  });

  it("rejects a model code over the length limit", () => {
    const errors = errorsOf({ models: ["m".repeat(SPEC_LIMITS.modelCode + 1)], rows: [] });
    expect(errors["models.0"]).toMatch(new RegExp(String(SPEC_LIMITS.modelCode)));
  });
});

describe("validateSpecGrid: property names and texts", () => {
  it("rejects a blank property name and says which row", () => {
    expect(errorsOf({ models: ["A"], rows: [row("Strength", ["1"]), row("  ", ["2"]), row("", ["3"])] })).toEqual({
      "rows.1.name": PROPERTY_REQUIRED_MESSAGE,
      "rows.2.name": PROPERTY_REQUIRED_MESSAGE,
    });
  });

  it("limits the length of names, units, test methods and values", () => {
    const errors = errorsOf({
      models: ["A", "B"],
      rows: [
        {
          name: "n".repeat(SPEC_LIMITS.propertyName + 1),
          unit: "u".repeat(SPEC_LIMITS.unit + 1),
          testMethod: "t".repeat(SPEC_LIMITS.testMethod + 1),
          values: ["ok", "v".repeat(SPEC_LIMITS.value + 1)],
        },
      ],
    });
    expect(Object.keys(errors).sort()).toEqual(["rows.0.name", "rows.0.testMethod", "rows.0.unit", "rows.0.values.1"]);
    expect(errors["rows.0.name"]).toMatch(String(SPEC_LIMITS.propertyName));
    expect(errors["rows.0.values.1"]).toMatch(String(SPEC_LIMITS.value));
  });

  it("rejects line breaks and control characters, which a one-line cell cannot hold", () => {
    expect(Object.keys(errorsOf({ models: ["A\nB"], rows: [] }))).toEqual(["models.0"]);
    expect(Object.keys(errorsOf({ models: ["A"], rows: [row("Strength\u0000", ["1"])] }))).toEqual(["rows.0.name"]);
    expect(Object.keys(errorsOf({ models: ["A"], rows: [row("Strength", ["1\u0007"])] }))).toEqual(["rows.0.values.0"]);
    expect(Object.keys(errorsOf({ models: ["A"], rows: [row("Strength", ["1"], "k\tN")] }))).toEqual(["rows.0.unit"]);
  });

  it("reports every problem at once, so the admin can fix them in one go", () => {
    const errors = errorsOf({ models: ["A", "A", ""], rows: [row("", ["1", "2", "3"])] });
    expect(Object.keys(errors).sort()).toEqual(["models.0", "models.1", "models.2", "rows.0.name"]);
  });
});

describe("validateSpecGrid: size and shape", () => {
  it("limits the number of models and of properties", () => {
    const tooManyModels = Array.from({ length: SPEC_LIMITS.models + 1 }, (_, i) => `M${i}`);
    expect(errorsOf({ models: tooManyModels, rows: [] }).grid).toMatch(String(SPEC_LIMITS.models));

    const tooManyRows = Array.from({ length: SPEC_LIMITS.rows + 1 }, (_, i) => row(`P${i}`, []));
    expect(errorsOf({ models: [], rows: tooManyRows }).grid).toMatch(String(SPEC_LIMITS.rows));
  });

  it("rejects anything that is not a grid, without throwing", () => {
    for (const input of [null, undefined, 42, "grid", [], {}, { models: "A", rows: [] }, { models: [], rows: {} }]) {
      expect(errorsOf(input), JSON.stringify(input)).toEqual({ grid: GRID_MALFORMED_MESSAGE });
    }
  });

  it("rejects a model code that is not text, a row that is not an object, and cells that are not text", () => {
    expect(errorsOf({ models: [5], rows: [] })).toEqual({ grid: GRID_MALFORMED_MESSAGE });
    expect(errorsOf({ models: ["A"], rows: ["Strength"] })).toEqual({ grid: GRID_MALFORMED_MESSAGE });
    expect(errorsOf({ models: ["A"], rows: [{ name: 7, unit: null, testMethod: null, values: ["1"] }] })).toEqual({
      grid: GRID_MALFORMED_MESSAGE,
    });
    expect(errorsOf({ models: ["A"], rows: [row("S", [12 as unknown as string])] })).toEqual({ grid: GRID_MALFORMED_MESSAGE });
    expect(errorsOf({ models: ["A"], rows: [{ name: "S", unit: 3, testMethod: null, values: ["1"] }] })).toEqual({
      grid: GRID_MALFORMED_MESSAGE,
    });
  });

  it("rejects a row whose number of values differs from the number of models", () => {
    expect(errorsOf({ models: ["A", "B"], rows: [row("Strength", ["1"])] })).toEqual({ grid: GRID_MALFORMED_MESSAGE });
    expect(errorsOf({ models: ["A"], rows: [row("Strength", ["1", "2"])] })).toEqual({ grid: GRID_MALFORMED_MESSAGE });
  });

  it("drops fields it does not know instead of passing them on", () => {
    const data = dataOf({
      models: ["A"],
      extra: "x",
      rows: [{ name: "S", unit: null, testMethod: null, values: ["1"], id: "p1", sort_order: 9 }],
    });
    expect(data).toEqual({ models: ["A"], rows: [{ name: "S", unit: null, testMethod: null, values: ["1"] }] });
  });

  it("does not change its input", () => {
    const input = { models: [" A "], rows: [row(" S ", [" 1 "])] };
    const copy = structuredClone(input);
    validateSpecGrid(input);
    expect(input).toEqual(copy);
  });
});

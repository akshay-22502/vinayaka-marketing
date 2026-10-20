import { describe, expect, it } from "vitest";
import { toRpcPayload, toSpecGrid } from "@/lib/content/spec-grid";
import type { SpecGrid } from "@/lib/content/types";

const model = (id: string, code: string, sort_order: number) => ({ id, code, sort_order });
const property = (
  id: string,
  name: string,
  sort_order: number,
  unit = "",
  test_method = "",
) => ({ id, name, unit, test_method, sort_order });
const value = (property_id: string, model_id: string, v: string) => ({
  property_id,
  model_id,
  value: v,
});

describe("toSpecGrid", () => {
  it("orders models and rows by sort_order, not by the order they arrive in", () => {
    const grid = toSpecGrid(
      [model("m3", "BX3030", 2), model("m1", "BX1515", 0), model("m2", "BX2020", 1)],
      [
        property("p2", "Mass per unit area", 1, "g/m²", "ASTM D5261"),
        property("p1", "Tensile strength", 0, "kN/m", "ASTM D6637"),
      ],
      [
        value("p1", "m1", "15"),
        value("p1", "m2", "20"),
        value("p1", "m3", "30"),
        value("p2", "m3", "300"),
        value("p2", "m2", "200"),
        value("p2", "m1", "150"),
      ],
    );

    expect(grid.models).toEqual(["BX1515", "BX2020", "BX3030"]);
    expect(grid.rows).toEqual([
      { name: "Tensile strength", unit: "kN/m", testMethod: "ASTM D6637", values: ["15", "20", "30"] },
      {
        name: "Mass per unit area",
        unit: "g/m²",
        testMethod: "ASTM D5261",
        values: ["150", "200", "300"],
      },
    ]);
  });

  it("puts null at the right index when a model has no value for a property", () => {
    const grid = toSpecGrid(
      [model("m1", "A", 0), model("m2", "B", 1), model("m3", "C", 2)],
      [property("p1", "Strength", 0), property("p2", "Mass", 1)],
      [
        // Strength has no value for B; Mass has none for A and C.
        value("p1", "m1", "10"),
        value("p1", "m3", "30"),
        value("p2", "m2", "200"),
      ],
    );

    expect(grid.rows[0].values).toEqual(["10", null, "30"]);
    expect(grid.rows[1].values).toEqual([null, "200", null]);
    // Every row is exactly as wide as the model list.
    for (const row of grid.rows) expect(row.values).toHaveLength(grid.models.length);
  });

  it("treats blank values as missing, and keeps real ones as they are", () => {
    const grid = toSpecGrid(
      [model("m1", "A", 0), model("m2", "B", 1), model("m3", "C", 2)],
      [property("p1", "Strength", 0)],
      [value("p1", "m1", ""), value("p1", "m2", "   "), value("p1", "m3", "15 / 15")],
    );

    expect(grid.rows[0].values).toEqual([null, null, "15 / 15"]);
  });

  it("gives a row with no unit or test method null for them", () => {
    const grid = toSpecGrid(
      [model("m1", "A", 0)],
      [property("p1", "Colour", 0, "", ""), property("p2", "Roll width", 1, "m", "")],
      [value("p1", "m1", "Black"), value("p2", "m1", "4")],
    );

    expect(grid.rows[0]).toMatchObject({ unit: null, testMethod: null });
    expect(grid.rows[1]).toMatchObject({ unit: "m", testMethod: null });
  });

  it("ignores values that point at a model or property that is not in the table", () => {
    const grid = toSpecGrid(
      [model("m1", "A", 0)],
      [property("p1", "Strength", 0)],
      [value("p1", "m1", "10"), value("p1", "gone", "99"), value("gone", "m1", "98")],
    );

    expect(grid).toEqual({
      models: ["A"],
      rows: [{ name: "Strength", unit: null, testMethod: null, values: ["10"] }],
    });
  });

  it("returns an empty grid when there are no models and no properties", () => {
    expect(toSpecGrid([], [], [])).toEqual({ models: [], rows: [] });
  });

  it("gives rows with no models an empty values list", () => {
    const grid = toSpecGrid([], [property("p1", "Strength", 0)], []);
    expect(grid.rows).toEqual([{ name: "Strength", unit: null, testMethod: null, values: [] }]);
  });
});

/**
 * What the database ends up holding after save_spec_table(payload): the three tables, with the
 * RPC's behaviour (array order becomes sort_order, a missing unit or value is stored as "").
 */
function storeLikeTheRpc(payload: ReturnType<typeof toRpcPayload>) {
  const models = payload.models.map((code, index) => model(`m${index}`, code, index));
  const properties = payload.rows.map((row, index) => property(`p${index}`, row.name, index, row.unit, row.test_method));
  const values = payload.rows.flatMap((row, p) => row.values.map((v, m) => value(`p${p}`, `m${m}`, v)));
  return { models, properties, values };
}

describe("toRpcPayload", () => {
  const grid: SpecGrid = {
    models: ["BX1515", "BX2020", "BX3030"],
    rows: [
      { name: "Tensile strength, MD / XMD", unit: "kN/m", testMethod: "ASTM D6637", values: ["15 / 15", null, "30 / 30"] },
      { name: "Colour", unit: null, testMethod: null, values: ["Black", "Black", null] },
    ],
  };

  it("has the shape save_spec_table expects: snake_case keys, text everywhere, one value per model", () => {
    expect(toRpcPayload(grid)).toEqual({
      models: ["BX1515", "BX2020", "BX3030"],
      rows: [
        { name: "Tensile strength, MD / XMD", unit: "kN/m", test_method: "ASTM D6637", values: ["15 / 15", "", "30 / 30"] },
        { name: "Colour", unit: "", test_method: "", values: ["Black", "Black", ""] },
      ],
    });
  });

  it("round-trips: reading back what was saved gives the grid that was sent", () => {
    const stored = storeLikeTheRpc(toRpcPayload(grid));
    expect(toSpecGrid(stored.models, stored.properties, stored.values)).toEqual(grid);
  });

  it("round-trips an empty grid, a grid with no models and a grid with no rows", () => {
    for (const empty of [
      { models: [], rows: [] },
      { models: [], rows: [{ name: "Strength", unit: null, testMethod: null, values: [] }] },
      { models: ["A", "B"], rows: [] },
    ] satisfies SpecGrid[]) {
      const stored = storeLikeTheRpc(toRpcPayload(empty));
      expect(toSpecGrid(stored.models, stored.properties, stored.values)).toEqual(empty);
    }
  });

  it("round-trips the seed-style table of the PP Biaxial Geogrid", () => {
    const seedLike: SpecGrid = {
      models: ["BX1515", "BX2020", "BX3030", "BX4040"],
      rows: [
        { name: "Junction efficiency", unit: "%", testMethod: "GRI-GG2", values: ["≥ 93", "≥ 93", "≥ 93", "≥ 93"] },
        { name: "Aperture size, MD x XMD", unit: "mm", testMethod: null, values: ["40 x 40", "40 x 40", "40 x 40", "40 x 40"] },
      ],
    };
    const stored = storeLikeTheRpc(toRpcPayload(seedLike));
    expect(toSpecGrid(stored.models, stored.properties, stored.values)).toEqual(seedLike);
  });

  it("sends null as an empty string (never the word null, never undefined)", () => {
    const payload = toRpcPayload({ models: ["A"], rows: [{ name: "X", unit: null, testMethod: null, values: [null] }] });
    expect(payload.rows[0]).toEqual({ name: "X", unit: "", test_method: "", values: [""] });
    expect(JSON.stringify(payload)).not.toContain("null");
  });

  it("gives every row exactly one value per model: short rows are padded, extra values dropped", () => {
    const payload = toRpcPayload({
      models: ["A", "B", "C"],
      rows: [
        { name: "Short", unit: null, testMethod: null, values: ["1"] },
        { name: "Long", unit: null, testMethod: null, values: ["1", "2", "3", "4", "5"] },
      ],
    });
    expect(payload.rows[0].values).toEqual(["1", "", ""]);
    expect(payload.rows[1].values).toEqual(["1", "2", "3"]);
  });

  it("keeps the order of models and rows (array order becomes sort_order)", () => {
    const payload = toRpcPayload({
      models: ["Z", "A"],
      rows: [
        { name: "Second alphabetically", unit: null, testMethod: null, values: ["z", "a"] },
        { name: "First alphabetically", unit: null, testMethod: null, values: ["z", "a"] },
      ],
    });
    expect(payload.models).toEqual(["Z", "A"]);
    expect(payload.rows.map((row) => row.name)).toEqual(["Second alphabetically", "First alphabetically"]);
  });

  it("does not change the grid it is given", () => {
    const copy = structuredClone(grid);
    toRpcPayload(grid);
    expect(grid).toEqual(copy);
  });
});

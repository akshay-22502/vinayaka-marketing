import type { SpecGrid } from "./types";

/** Rows as stored in the database (spec_models, spec_properties, spec_values). */
export type SpecModelRow = { id: string; code: string; sort_order: number };
export type SpecPropertyRow = {
  id: string;
  name: string;
  unit: string | null;
  test_method: string | null;
  sort_order: number;
};
export type SpecValueRow = { property_id: string; model_id: string; value: string | null };

/** Blank text (the database stores "no value" as an empty string) becomes null. */
function blankToNull(text: string | null | undefined): string | null {
  return text == null || text.trim() === "" ? null : text;
}

/**
 * Turns the three spec tables into the grid the product page renders.
 *
 * Models and rows are ordered by `sort_order`. Every row has exactly one entry
 * per model; a model with no value for a property, or only a blank one, gets
 * `null` at its position so the page can show a dash. Values that point at a
 * model or property that is not in the table are ignored.
 */
export function toSpecGrid(
  models: SpecModelRow[],
  properties: SpecPropertyRow[],
  values: SpecValueRow[],
): SpecGrid {
  // Array.prototype.sort is stable, so ties keep the order they arrived in.
  const orderedModels = [...models].sort((a, b) => a.sort_order - b.sort_order);
  const orderedProperties = [...properties].sort((a, b) => a.sort_order - b.sort_order);

  const cells = new Map<string, string | null>();
  for (const v of values) cells.set(`${v.property_id}:${v.model_id}`, blankToNull(v.value));

  return {
    models: orderedModels.map((m) => m.code),
    rows: orderedProperties.map((p) => ({
      name: p.name,
      unit: blankToNull(p.unit),
      testMethod: blankToNull(p.test_method),
      values: orderedModels.map((m) => cells.get(`${p.id}:${m.id}`) ?? null),
    })),
  };
}

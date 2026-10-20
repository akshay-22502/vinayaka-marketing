// Size limits of a product's spec table. A plain module (no zod) so the editor in the browser and
// the validation on the server use the same numbers.

export const SPEC_LIMITS = {
  /** Models (columns) per product. The seeded tables have 4 or 5. */
  models: 30,
  /** Properties (rows) per product. The seeded tables have 5 to 10. */
  rows: 100,
  /** Characters in a model code such as BX1515. */
  modelCode: 40,
  propertyName: 200,
  unit: 40,
  testMethod: 100,
  /** Characters in one cell. Values are short text such as "15 / 15" or "≥ 93". */
  value: 200,
} as const;

import type { SpecGrid } from "@/lib/content/types";
import type { Parsed } from "./schemas";
import { SPEC_LIMITS } from "./spec-limits";

// Validation of the grid the spec editor sends to saveSpecGrid. It receives `unknown`, because a
// Server Action is a public endpoint: whatever the browser (or a hand-made request) sends is
// checked here before the RPC sees it. Errors are keyed by position so the editor can mark the
// input that is wrong:
//
//   models.<i>                  a model code        rows.<i>.name | unit | testMethod   a property
//   rows.<i>.values.<j>         one cell            grid                                 the table as a whole

export const MODEL_REQUIRED_MESSAGE = "Enter a model code";
export const PROPERTY_REQUIRED_MESSAGE = "Enter a property name";
export const GRID_MALFORMED_MESSAGE = "The table could not be read. Reload the page and try again.";
const ONE_LINE_MESSAGE = "Remove line breaks and special characters";

export function duplicateModelMessage(code: string): string {
  return `“${code}” is used for more than one model. Model codes must be different.`;
}

function tooLongMessage(max: number): string {
  return `Use ${max} characters or fewer`;
}

// Control characters (line breaks, tabs, NUL) have no place in a one-line cell, and NUL cannot be stored.
const CONTROL_CHARACTER = /\p{Cc}/u;

type Texts = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks one text and returns it trimmed, or records why it is not allowed under `key`. */
function checkText(text: string, key: string, max: number, errors: Texts): string {
  const trimmed = text.trim();
  if (CONTROL_CHARACTER.test(trimmed)) errors[key] = ONE_LINE_MESSAGE;
  else if (trimmed.length > max) errors[key] = tooLongMessage(max);
  return trimmed;
}

const blankToNull = (text: string): string | null => (text === "" ? null : text);

/**
 * Validates a spec grid and returns it cleaned: every text trimmed, a blank unit, test method or
 * value as null, unknown fields dropped. Rejects: more than SPEC_LIMITS.models models or
 * SPEC_LIMITS.rows rows; a blank or over-long model code; model codes that repeat (ignoring case
 * and surrounding spaces); a blank property name; over-long or multi-line texts; and any shape
 * that is not a grid (including a row whose values do not match the number of models).
 */
export function validateSpecGrid(input: unknown): Parsed<SpecGrid> {
  if (!isRecord(input) || !Array.isArray(input.models) || !Array.isArray(input.rows)) {
    return { ok: false, errors: { grid: GRID_MALFORMED_MESSAGE } };
  }
  const rawModels: unknown[] = input.models;
  const rawRows: unknown[] = input.rows;

  if (rawModels.length > SPEC_LIMITS.models) {
    return { ok: false, errors: { grid: `A table can have up to ${SPEC_LIMITS.models} models. Remove some models and try again.` } };
  }
  if (rawRows.length > SPEC_LIMITS.rows) {
    return { ok: false, errors: { grid: `A table can have up to ${SPEC_LIMITS.rows} properties. Remove some properties and try again.` } };
  }
  if (!rawModels.every((model) => typeof model === "string")) {
    return { ok: false, errors: { grid: GRID_MALFORMED_MESSAGE } };
  }

  const errors: Texts = {};

  // Model codes ------------------------------------------------------------------
  const models = (rawModels as string[]).map((code, index) => {
    const trimmed = checkText(code, `models.${index}`, SPEC_LIMITS.modelCode, errors);
    if (trimmed === "") errors[`models.${index}`] = MODEL_REQUIRED_MESSAGE;
    return trimmed;
  });
  const positionsByCode = new Map<string, number[]>();
  models.forEach((code, index) => {
    if (code === "") return;
    const key = code.toLowerCase();
    positionsByCode.set(key, [...(positionsByCode.get(key) ?? []), index]);
  });
  for (const positions of positionsByCode.values()) {
    if (positions.length < 2) continue;
    // Every column that clashes is marked, so the admin sees both.
    for (const index of positions) errors[`models.${index}`] ??= duplicateModelMessage(models[index]);
  }

  // Properties and cells -----------------------------------------------------------
  const rows: SpecGrid["rows"] = [];
  for (const [index, rawRow] of rawRows.entries()) {
    if (!isRecord(rawRow)) return { ok: false, errors: { grid: GRID_MALFORMED_MESSAGE } };
    const { name, unit, testMethod, values } = rawRow;
    const optionalText = (value: unknown) => value === null || value === undefined || typeof value === "string";
    if (
      typeof name !== "string" ||
      !optionalText(unit) ||
      !optionalText(testMethod) ||
      !Array.isArray(values) ||
      values.length !== models.length ||
      !values.every(optionalText)
    ) {
      return { ok: false, errors: { grid: GRID_MALFORMED_MESSAGE } };
    }

    const cleanName = checkText(name, `rows.${index}.name`, SPEC_LIMITS.propertyName, errors);
    if (cleanName === "") errors[`rows.${index}.name`] = PROPERTY_REQUIRED_MESSAGE;
    const cleanUnit = checkText((unit as string | null | undefined) ?? "", `rows.${index}.unit`, SPEC_LIMITS.unit, errors);
    const cleanMethod = checkText(
      (testMethod as string | null | undefined) ?? "",
      `rows.${index}.testMethod`,
      SPEC_LIMITS.testMethod,
      errors,
    );
    const cleanValues = (values as (string | null | undefined)[]).map((value, column) =>
      blankToNull(checkText(value ?? "", `rows.${index}.values.${column}`, SPEC_LIMITS.value, errors)),
    );

    rows.push({ name: cleanName, unit: blankToNull(cleanUnit), testMethod: blankToNull(cleanMethod), values: cleanValues });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { models, rows } };
}

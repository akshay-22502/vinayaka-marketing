// What a save or delete Server Action returns to the admin form, and how database errors
// become messages a person can act on. Plain module (no "use server"), so client components
// and tests can import its types and constants.

/** Success, or a message per form field. The key `form` is for a problem that belongs to no single field. */
export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };
export type ActionFailure = Extract<ActionResult, { ok: false }>;

/** The key under which a message that belongs to the whole form is returned. */
export const FORM_ERROR = "form";

/** The key of the "publish anyway" confirmation of a product (see productSchema). */
export const PUBLISH_CONFIRM_FIELD = "publish_confirm";

export const SLUG_TAKEN_MESSAGE = "This URL slug is already used";
export const CATEGORY_HAS_PRODUCTS_MESSAGE = "This category still has products. Move or delete them first.";
export const NOT_FOUND_MESSAGE = "This item no longer exists. It may have been deleted in another window.";
export const CATEGORY_GONE_MESSAGE = "This category no longer exists. Choose another one.";
export const SUPPLIER_HAS_PURCHASES_MESSAGE = "This supplier has purchases. Delete those purchases first.";
export const SUPPLIER_GONE_MESSAGE = "This supplier no longer exists. Choose another one.";
const NOT_ALLOWED_MESSAGE = "You do not have permission to do that. Sign in again with an admin account.";
const INVALID_VALUES_MESSAGE =
  "Some values are not valid. Check the model codes, property names and values, then save again.";
const VALUE_TAKEN_MESSAGE = "Another item already uses one of these values. Change it and try again.";
const LINKED_MESSAGE = "A linked item no longer exists or is still in use. Reload the page and try again.";
const SAVE_FAILED_MESSAGE = "Could not save. Please try again.";

export function failure(errors: Record<string, string>): ActionFailure {
  return { ok: false, errors };
}

type PgErrorLike = { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Whether a unique violation was on a slug column (`categories_slug_key`, `projects_slug_key`, ...). */
function isSlugViolation(error: PgErrorLike): boolean {
  const message = text(error.message);
  // The name of the constraint that was broken: given on its own, or quoted in the message.
  const constraint = text(error.constraint) || /unique constraint "([^"]+)"/.exec(message)?.[1];
  if (constraint) return /slug/i.test(constraint);
  return /slug/i.test(`${message} ${text(error.details)}`);
}

/**
 * Turns a Postgres/PostgREST error into form messages:
 *  - unique violation on a slug: "This URL slug is already used" on the slug field (never a 500);
 *  - deleting a category that still has products (`products.category_id` is ON DELETE RESTRICT):
 *    a friendly message for the form; saving a product into a category that was deleted in the
 *    meantime: a message on the category field; the same for a supplier that still has purchases;
 *  - the spec table RPC's own errors: product not found (P0002), not an admin (42501), rejected
 *    input (22023);
 *  - anything else: a generic message. The database text is never shown to the admin.
 */
export function fromPgError(error: unknown): ActionFailure {
  const pg: PgErrorLike = typeof error === "object" && error !== null ? error : {};
  const code = text(pg.code);

  if (code === "23505") {
    return failure(isSlugViolation(pg) ? { slug: SLUG_TAKEN_MESSAGE } : { [FORM_ERROR]: VALUE_TAKEN_MESSAGE });
  }

  if (code === "23503") {
    const detail = `${text(pg.message)} ${text(pg.details)} ${text(pg.constraint)}`;
    if (/products_category_id/.test(detail)) {
      // Saving a product (insert or update) names a category that is gone; deleting a category names the products that block it.
      return /insert or update on table "products"/.test(detail)
        ? failure({ category_id: CATEGORY_GONE_MESSAGE })
        : failure({ [FORM_ERROR]: CATEGORY_HAS_PRODUCTS_MESSAGE });
    }
    if (/purchases_supplier_id/.test(detail)) {
      // The same for a purchase and its supplier (`purchases.supplier_id` is ON DELETE RESTRICT).
      return /insert or update on table "purchases"/.test(detail)
        ? failure({ supplier_id: SUPPLIER_GONE_MESSAGE })
        : failure({ [FORM_ERROR]: SUPPLIER_HAS_PURCHASES_MESSAGE });
    }
    return failure({ [FORM_ERROR]: LINKED_MESSAGE });
  }

  // Raised by save_spec_table().
  if (code === "P0002") return failure({ [FORM_ERROR]: NOT_FOUND_MESSAGE });
  if (code === "42501") return failure({ [FORM_ERROR]: NOT_ALLOWED_MESSAGE });
  if (code === "22023") return failure({ [FORM_ERROR]: INVALID_VALUES_MESSAGE });

  return failure({ [FORM_ERROR]: SAVE_FAILED_MESSAGE });
}

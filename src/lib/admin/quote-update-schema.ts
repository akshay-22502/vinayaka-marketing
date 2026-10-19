import { z } from "zod";
import { QUOTE_STATUSES } from "./quote-filters";
import { ADMIN_NOTES_MAX } from "./quote-view";
import { paragraphs } from "./schemas";

export { ADMIN_NOTES_MAX };

// What the quote review form (status and notes) may send. Called as updateQuote(id, { status, adminNotes }),
// so it parses an object and not a FormData. Anything else in the object is dropped: an admin can change
// these two columns of a request and nothing the buyer wrote.

export const STATUS_MESSAGE = "Choose a status";

export const quoteUpdateSchema = z.object({
  status: z.enum(QUOTE_STATUSES, { error: STATUS_MESSAGE }),
  // Blank notes are stored as null, like a request that never had any.
  adminNotes: paragraphs("Notes", ADMIN_NOTES_MAX).transform((notes) => (notes === "" ? null : notes)),
});

export type QuoteUpdate = z.output<typeof quoteUpdateSchema>;

// The rules for a quote attachment, in one place for both sides of the form: the quote API
// (`schema.ts`, `handle.ts`, `store.ts`) and the browser, which checks a file before posting it.
// This file must stay free of server-only and heavy imports (it ships in the client bundle);
// in particular it does not import zod.

/** The most the quote API accepts, and the limit set on the `quote-attachments` bucket. */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

const GENERIC_TYPES = ["", "application/octet-stream"];

export type AttachmentType = { storedAs: string; reported: string[] };

/**
 * Allowed extensions, with the content type each is stored as and the types browsers report.
 * A Map, not an object: looking up "constructor" or "__proto__" in a plain object finds
 * inherited properties, which would let those extensions through as if they were allowed.
 */
const ATTACHMENT_TYPES: ReadonlyMap<string, AttachmentType> = new Map<string, AttachmentType>([
  ["pdf", { storedAs: "application/pdf", reported: ["application/pdf", "application/x-pdf"] }],
  ["jpg", { storedAs: "image/jpeg", reported: ["image/jpeg", "image/pjpeg"] }],
  ["jpeg", { storedAs: "image/jpeg", reported: ["image/jpeg", "image/pjpeg"] }],
  ["png", { storedAs: "image/png", reported: ["image/png"] }],
  [
    "dwg",
    {
      storedAs: "image/vnd.dwg",
      reported: [
        "image/vnd.dwg",
        "image/x-dwg",
        "application/acad",
        "application/x-acad",
        "application/autocad_dwg",
        "application/dwg",
        "application/x-dwg",
        "application/x-autocad",
      ],
    },
  ],
]);

/** Value for the file input's `accept` attribute: every allowed extension, with its dot. */
export const ATTACHMENT_ACCEPT = [...ATTACHMENT_TYPES.keys()].map((extension) => `.${extension}`).join(",");

/** Lower-case extension of a file name, without the dot; "" when there is none. */
export function attachmentExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** The allowed type for a file name, from its extension; undefined when it may not be attached. */
export function attachmentType(fileName: string): AttachmentType | undefined {
  return ATTACHMENT_TYPES.get(attachmentExtension(fileName));
}

/** Why a file cannot be attached, or null when it can (and when there is no file). */
export function validateAttachment(file: File | null): string | null {
  if (!file) return null;
  if (file.size === 0) return "The attachment is empty.";
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return "The attachment is larger than 4 MB. Send a smaller file, and email larger drawings to us after we reply.";
  }
  const allowed = attachmentType(file.name);
  if (!allowed) return "The attachment must be a PDF, JPG, PNG or DWG file.";
  const type = file.type.toLowerCase().split(";")[0]!.trim();
  if (!GENERIC_TYPES.includes(type) && !allowed.reported.includes(type)) {
    return "The attachment must be a PDF, JPG, PNG or DWG file.";
  }
  return null;
}

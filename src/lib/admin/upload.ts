import { slugify } from "@/lib/slug";

// Pure helpers for <MediaUpload>: where an uploaded file goes, whether a file may be uploaded,
// and how a stored path is shown. No browser or server APIs, so they are unit-tested.

/** Largest file the admin screens accept (the public-media bucket itself has no limit of its own). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** `accept` value for image fields. SVG is left out: next/image will not optimise it and it can carry script. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export const PDF_ACCEPT = "application/pdf";

/**
 * What a purchase document may be: PDF, a photo, Excel, Word or CSV. The purchase-documents bucket
 * lists the same types (migration 20261022000001_purchase_documents.sql).
 */
export const DOCUMENT_ACCEPT = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
].join(",");

/** Largest purchase document: scanned bills of entry run to several pages. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const MAX_NAME_LENGTH = 60;
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;

/**
 * Storage path for an uploaded file: `<folder>/<uuid>-<slugified name>.<ext>`. The uuid keeps two
 * uploads of the same file name apart; the slug keeps the path URL-safe whatever the file was
 * called. The extension is kept, lower-cased.
 */
export function uploadPath(folder: string, filename: string, uuid: string): string {
  const dot = filename.lastIndexOf(".");
  const hasExtension = dot > 0;
  const extension = hasExtension ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
  const base = slugify(hasExtension ? filename.slice(0, dot) : filename)
    .slice(0, MAX_NAME_LENGTH)
    .replace(/-+$/, "");
  const name = `${uuid}-${base || "file"}`;
  const directory = folder.replace(/^\/+|\/+$/g, "");
  return `${directory}/${name}${extension ? `.${extension}` : ""}`;
}

/** A random uuid, also where `crypto.randomUUID` is missing (plain-http pages on a network address). */
export function newUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const FRIENDLY_TYPES: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/msword": "Word",
  "text/csv": "CSV",
  "image/*": "an image",
  ".png": "PNG",
  ".jpg": "JPEG",
  ".jpeg": "JPEG",
  ".webp": "WebP",
  ".pdf": "PDF",
};

function matchesAccept(file: { name: string; type: string }, token: string): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (token.startsWith(".")) return name.endsWith(token);
  if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
  return type === token;
}

/** Why a file cannot be uploaded to a field with this `accept` list, or null when it can. */
export function checkUpload(
  file: { name: string; size: number; type: string },
  accept: string,
  maxBytes: number,
): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > maxBytes) return `"${file.name}" is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;

  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length > 0 && !tokens.some((token) => matchesAccept(file, token))) {
    const allowed = [...new Set(tokens.map((token) => FRIENDLY_TYPES[token] ?? token))];
    return `"${file.name}" is not an allowed file type. Use ${allowed.join(", ")}.`;
  }
  return null;
}

/** The file name behind a stored path, without its folder and uuid. */
export function displayName(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(UUID_PREFIX, "");
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"]);

export function isImagePath(path: string): boolean {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 && IMAGE_EXTENSIONS.has(file.slice(dot + 1).toLowerCase());
}

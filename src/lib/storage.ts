const PUBLIC_BUCKET = "public-media";

/**
 * Public URL of a file in the `public-media` bucket, or null when there is no file.
 * Safe to call from server and client components.
 */
export function publicMediaUrl(path: string | null): string | null {
  if (!path) return null;

  // Written out in full (not process.env[name]) so Next can inline it for client components.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. See .env.example.");

  const key = path
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${PUBLIC_BUCKET}/${key}`;
}

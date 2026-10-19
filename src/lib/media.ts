import { publicMediaUrl } from "@/lib/storage";

/** Neutral placeholder for applications, projects and categories without their own. */
export const APPLICATION_PLACEHOLDER = "/placeholders/application.svg";

const CATEGORY_PLACEHOLDERS = new Set(["geogrid", "geomembrane", "geotextile", "geocell"]);

/** Placeholder drawing (in /public/placeholders) for a category and the products in it. */
export function categoryPlaceholder(categorySlug: string): string {
  return CATEGORY_PLACEHOLDERS.has(categorySlug)
    ? `/placeholders/${categorySlug}.svg`
    : APPLICATION_PLACEHOLDER;
}

/** URL of a stored file, or `fallback` (a placeholder) when the entity has none. */
export function mediaOr(path: string | null, fallback: string): string {
  return publicMediaUrl(path) ?? fallback;
}

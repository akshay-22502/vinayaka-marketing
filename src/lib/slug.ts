/** URL-safe slug: lowercase ASCII, hyphen-separated, no leading/trailing hyphens. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Shortens a slug to at most `max` characters without leaving a trailing hyphen. It cuts at the
 * last hyphen that fits, so no word is split; a single word longer than `max` is cut at `max`.
 */
export function truncateSlug(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const head = slug.slice(0, max);
  // The next character is a hyphen: the head ends exactly at the end of a word.
  if (slug[max] === "-") return head.replace(/-+$/, "");
  const lastHyphen = head.lastIndexOf("-");
  return lastHyphen > 0 ? head.slice(0, lastHyphen) : head.replace(/-+$/, "");
}

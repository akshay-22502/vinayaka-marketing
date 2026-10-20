import { publicMediaUrl } from "@/lib/storage";

/** Neutral placeholder for projects, and for anything added later without a default image. */
export const APPLICATION_PLACEHOLDER = "/placeholders/application.svg";

/** Exploded layer diagram shown beside the home page banner. */
export const HERO_IMAGE = "/images/hero.webp";

// Default images (in /public/images) for the starter catalogue, named after the slug.
// Admin uploads replace them; a renamed or new entry falls back one level.
const CATEGORY_IMAGES = new Set(["geogrid", "geomembrane", "geotextile", "geocell"]);
const PRODUCT_IMAGES = new Set([
  "pp-biaxial-geogrid",
  "polyester-uniaxial-geogrid",
  "hdpe-geomembrane",
  "lldpe-geomembrane",
  "woven-geotextile",
  "nonwoven-geotextile",
  "hdpe-geocell",
]);
const APPLICATION_IMAGES = new Set([
  "roads-and-pavements",
  "slopes-and-retaining-walls",
  "landfills-and-containment",
  "ponds-and-canals",
  "erosion-control",
  "railways",
]);

/** Default image for a category without its own. */
export function categoryPlaceholder(categorySlug: string): string {
  return CATEGORY_IMAGES.has(categorySlug)
    ? `/images/categories/${categorySlug}.webp`
    : APPLICATION_PLACEHOLDER;
}

/** Default image for a product without photos: its own render, else its category's. */
export function productPlaceholder(productSlug: string, categorySlug: string): string {
  return PRODUCT_IMAGES.has(productSlug)
    ? `/images/products/${productSlug}.webp`
    : categoryPlaceholder(categorySlug);
}

/** Default cross-section drawing for an application without a photo. */
export function applicationPlaceholder(applicationSlug: string): string {
  return APPLICATION_IMAGES.has(applicationSlug)
    ? `/images/applications/${applicationSlug}.webp`
    : APPLICATION_PLACEHOLDER;
}

/** URL of a stored file, or `fallback` (a placeholder) when the entity has none. */
export function mediaOr(path: string | null, fallback: string): string {
  return publicMediaUrl(path) ?? fallback;
}

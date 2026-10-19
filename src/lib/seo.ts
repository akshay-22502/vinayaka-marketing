// Shared SEO helpers: absolute URLs, page metadata and JSON-LD.
//
// Every public page builds its metadata with `pageMetadata()`. Next replaces a
// parent's `openGraph` object rather than merging into it, so a page that set
// only a title would lose its og:url and og:image; routing every page through
// one function keeps the tags complete and consistent.

import type { Metadata } from "next";
import { env } from "@/lib/env";

export const SITE_NAME = "TerraTechBharat";

export const DEFAULT_DESCRIPTION =
  "Geosynthetics catalogue: geogrids, geomembranes, geotextiles and geocells for India and the UAE.";

/** Shared preview image (public/brand/og-default.png) for pages without a photo of their own. */
export const DEFAULT_OG_IMAGE = {
  url: "/brand/og-default.png",
  width: 1200,
  height: 630,
  alt: SITE_NAME,
};

/**
 * Absolute URL for a site path such as "/products". The home page ("/") is the
 * bare site URL with no trailing slash, which is also how Next writes its
 * canonical link, so every place that names the home page agrees. An address
 * that is already absolute is returned unchanged.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path === "/" || path === "") return env.NEXT_PUBLIC_SITE_URL;
  return `${env.NEXT_PUBLIC_SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Turns admin-entered text into a meta description: whitespace collapsed, cut
 * at a word boundary with an ellipsis when longer than `max`, and `undefined`
 * when there is nothing to say (so no empty tag is emitted).
 */
export function metaDescription(text: string | null | undefined, max = 160): string | undefined {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (clean.length <= max) return clean;

  const head = clean.slice(0, max - 1);
  const lastSpace = head.lastIndexOf(" ");
  // Cut at a word boundary, unless that would throw away most of the text.
  const cut = lastSpace > max * 0.6 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,.;:–—-]+$/, "")}…`;
}

export type PageSeo = {
  /** The page's own title; the root layout appends " | TerraTechBharat". `{ absolute }` is used as written. */
  title: string | { absolute: string };
  /** Plain text for the description; pass `metaDescription(...)` for admin-entered text. */
  description?: string;
  /** Site path of the page, such as "/products/geogrid". Becomes the canonical URL and og:url. */
  path: string;
  /** Absolute URL of a photo for link previews; the default image is used when missing. */
  image?: string | null;
};

/** Title, description, canonical link, Open Graph and Twitter tags for one page. */
export function pageMetadata({ title, description, path, image }: PageSeo): Metadata {
  const plainTitle = typeof title === "string" ? title : title.absolute;
  const summary = description ?? DEFAULT_DESCRIPTION;
  const previewImage = image ? { url: image, alt: plainTitle } : DEFAULT_OG_IMAGE;

  return {
    title,
    // Left out when empty: the root layout's default description then applies.
    ...(description ? { description } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url: path,
      title: plainTitle,
      description: summary,
      images: [previewImage],
    },
    twitter: {
      card: "summary_large_image",
      title: plainTitle,
      description: summary,
      images: [previewImage.url],
    },
  };
}

// JSON-LD -----------------------------------------------------------------------

export type JsonLdData = Record<string, unknown>;

/**
 * JSON for a <script type="application/ld+json"> tag. Names and summaries are
 * typed into the admin panel, so `<` (and `>`, `&`, and the two JS line
 * separators) are written as \uXXXX escapes: a value containing "</script>"
 * can then never end the tag early. The escapes are still valid JSON, so
 * search engines read back the original text.
 */
export function serializeJsonLd(data: JsonLdData): string {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * schema.org Product for a catalogue page. There is deliberately no `offers`
 * key: the site shows no prices.
 */
export function productJsonLd(product: {
  name: string;
  summary?: string | null;
  /** Absolute URL of the first product photo, if there is one. */
  image?: string | null;
  category?: string | null;
  path: string;
}): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.summary ? { description: product.summary } : {}),
    ...(product.image ? { image: product.image } : {}),
    brand: { "@type": "Brand", name: SITE_NAME },
    ...(product.category ? { category: product.category } : {}),
    url: absoluteUrl(product.path),
  };
}

export function organizationJsonLd(): JsonLdData {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/brand/logo.png"),
  };
}

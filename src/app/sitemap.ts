import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/content/queries";
import { absoluteUrl } from "@/lib/seo";

// Cached like the pages; admin saves revalidate it with them.
export const revalidate = 3600;

/** Every public page, from the database: nothing unpublished and no hidden section appears. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapEntries();
  return entries.map(({ path, updatedAt }) => ({
    url: absoluteUrl(path),
    lastModified: updatedAt,
  }));
}

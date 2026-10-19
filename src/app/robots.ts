import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

export default function robots(): MetadataRoute.Robots {
  // Preview deployments (branch and pull request builds) must not be indexed.
  if (env.isVercelPreview()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

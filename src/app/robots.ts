import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export const revalidate = 3600;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

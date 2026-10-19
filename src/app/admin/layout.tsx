import type { Metadata } from "next";

// Everything under /admin depends on who is signed in, so none of it may be prerendered or cached.
export const dynamic = "force-dynamic";

// The admin area (login included) stays out of search results. robots.txt blocks /admin too,
// and next.config.ts adds an X-Robots-Tag header; this is the page-level signal.
export const metadata: Metadata = {
  title: {
    default: "Admin | TerraTechBharat",
    template: "%s | Admin | TerraTechBharat",
  },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

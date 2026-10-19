import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { env } from "@/lib/env";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME } from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Public pages set their own title, description, canonical URL and Open Graph
// tags through pageMetadata() (a page's openGraph replaces this one, it is not
// merged). These defaults cover everything else, such as the 404 page.
export const metadata: Metadata = {
  // Relative URLs in metadata (canonical, og:image, ...) are resolved against this.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}

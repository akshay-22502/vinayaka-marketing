import type { NextConfig } from "next";

/**
 * Lets next/image load photos from the Supabase public-media bucket. The host
 * comes from NEXT_PUBLIC_SUPABASE_URL (127.0.0.1:54321 locally, the project
 * URL in production), which Next has loaded from the env files by this point.
 */
function supabaseImagePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  const { protocol, hostname, port } = new URL(raw);
  return [
    {
      protocol: protocol === "http:" ? "http" : "https",
      hostname,
      port,
      pathname: "/storage/v1/object/public/**",
    },
  ];
}

const nextConfig: NextConfig = {
  images: { remotePatterns: supabaseImagePatterns() },
  async headers() {
    return [
      {
        // No other site may put our pages in a frame (clickjacking; the admin login most of all).
        // This only limits who may frame us: our own pages can still embed the Turnstile iframe.
        // X-Frame-Options is the same rule for browsers that predate frame-ancestors.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Scroll-story frames: without this Vercel revalidates every one of the 72 frames on each
        // visit. They change only when re-rendered, so a day fresh and a week stale is safe.
        source: "/hero/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        // The admin area (login included) must never show up in search results.
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;

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
};

export default nextConfig;

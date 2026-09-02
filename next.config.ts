import type { NextConfig } from "next";

/**
 * The site is exported as static files and served by GitHub Pages, so it has no
 * server of its own: every dynamic read goes to the Supabase Edge Function
 * (see src/lib/api.ts). NEXT_PUBLIC_BASE_PATH is "/<repo>" on a github.io URL and
 * empty on a custom domain.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true, // GitHub Pages serves /path/ → /path/index.html
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;

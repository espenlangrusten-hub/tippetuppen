import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Ship the football source data with the server bundle so the admin can seed a
  // fresh database without shell access (needed on Vercel and other serverless hosts).
  outputFileTracingIncludes: { "/admin": ["./data/source/**/*"] },
  poweredByHeader: false,
  devIndicators: false,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;

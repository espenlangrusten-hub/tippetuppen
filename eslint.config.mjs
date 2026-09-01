import nextConfig from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

export default [
  ...nextConfig,
  ...nextTs,
  { ignores: [".next/**", ".data/**", "drizzle/**", "playwright-report/**", "test-results/**"] },
];

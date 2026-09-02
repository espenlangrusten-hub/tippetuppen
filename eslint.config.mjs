import nextConfig from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextConfig,
  ...nextTs,
  { ignores: [".next/**", ".data/**", "drizzle/**", "playwright-report/**", "test-results/**", "supabase/**", "out/**"] },
  {
    rules: {
      // Game state, streaks and consent live in localStorage and are read after mount on purpose
      // (server render must not depend on them, or hydration would mismatch).
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;

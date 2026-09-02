import { defineConfig, devices } from "@playwright/test";


export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3200",
    trace: "retain-on-failure",
    launchOptions: { args: ["--no-sandbox"] },
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  // The site is a static export; e2e runs against `npx serve out` plus the local
  // dev stack (scripts/dev-stack.sh) standing in for Supabase.
  webServer: undefined,
});

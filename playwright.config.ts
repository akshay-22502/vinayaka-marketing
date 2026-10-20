import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { assertLocalSupabase } from "./scripts/lib/assert-local-supabase";

// E2E runs against a production build (`npm run test:e2e` first runs the
// `pretest:e2e` script: db:reset, scripts/e2e-prepare.ts, next build) so that
// caching and revalidation are real. In the CI/sandbox image Chromium comes preinstalled
// (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers), so do not run `playwright install` there.
// On a fresh machine, run `npx playwright install chromium` once.

// scripts/e2e-prepare.ts writes the local Supabase keys and E2E flags here.
// Loading it makes them available to test code (e.g. the service-role key) and
// to the `next start` child process. Variables already set in the shell win, which is why the
// address is checked right after: a live project exported in the shell stops the run here.
if (existsSync(".env.production.local")) process.loadEnvFile(".env.production.local");
assertLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL, "playwright.config.ts");

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  // One worker, files in order: the specs share one database.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX as-is for Next; component tests need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside a Next server build; see the stub.
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Runs against the local Supabase stack (npm run db:start); needs Docker.
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          globalSetup: ["tests/db/global-setup.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});

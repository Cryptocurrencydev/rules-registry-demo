import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/rr_test" },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

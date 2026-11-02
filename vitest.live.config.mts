import path from "node:path";
import { defineConfig } from "vitest/config";

/** Live checks against real external services (`npm run check:ai`). Not part of `npm test`. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.live.ts"],
    exclude: ["node_modules/**", ".next/**"],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});

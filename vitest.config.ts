import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js guards server modules with this import; tests run them directly.
      "server-only": path.resolve(__dirname, "test/empty.ts"),
    },
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});

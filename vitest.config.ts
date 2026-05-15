import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Stubs para módulos que existem só no runtime do Next/cliente.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "next/headers": path.resolve(__dirname, "tests/stubs/next-headers.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});

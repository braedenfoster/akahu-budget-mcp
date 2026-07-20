import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Financial fixtures are deterministic; no need for globals.
    globals: false,
  },
});

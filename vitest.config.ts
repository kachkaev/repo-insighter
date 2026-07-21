import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The CLI end-to-end tests spawn real git repositories and subprocesses,
    // which comfortably outlast Vitest's 5s default.
    testTimeout: 60_000,
  },
});

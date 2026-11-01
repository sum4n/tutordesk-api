import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Test files must run one at a time. beforeEach deletes rows in
    // foreign-key order; two files running in parallel would race on
    // the same tables and produce intermittent FK violations that
    // look like application bugs.
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});

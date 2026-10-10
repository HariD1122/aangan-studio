import { defineConfig } from "vitest/config";

// The database tests make many round trips to Neon (US region), so give setup steps room and retry a transient failure once.
export default defineConfig({
  test: { hookTimeout: 60_000, testTimeout: 60_000, retry: 1 },
});

// frontend/config/vitest.config.js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // ⬅️ set the root to the frontend folder so all paths are from here
  root: path.resolve(__dirname, ".."),

  plugins: [react()],
  esbuild: { jsx: "automatic", jsxImportSource: "react" },

  resolve: {
    alias: {
      "/src": path.resolve(__dirname, "../src"),
      "@": path.resolve(__dirname, "../src"),
    },
    dedupe: ["react", "react-dom"],
  },

  test: {
    environment: "happy-dom",
    include: ["tests/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    setupFiles: ["tests/setupTests.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
    },
    globals: true,
  },
});

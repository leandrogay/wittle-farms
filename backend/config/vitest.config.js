// backend/config/vitest.config.js
import { defineConfig, defineProject } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const FRONTEND_ROOT = path.resolve(__dirname, "../../frontend");
const FRONTEND_SRC = path.join(FRONTEND_ROOT, "src");
const FRONTEND_TESTS = path.join(FRONTEND_ROOT, "tests");
const BACKEND_ROOT = path.resolve(__dirname, "..");
const BACKEND_NODE = path.join(BACKEND_ROOT, "node_modules");

export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },

  resolve: {
    alias: {
      // frontend absolute import support
      "/src": FRONTEND_SRC,
      "@": FRONTEND_SRC,

      // force a single instance of React and Router (avoid duplicates)
      react: path.join(BACKEND_NODE, "react"),
      "react/jsx-runtime": path.join(BACKEND_NODE, "react/jsx-runtime.js"),
      "react-dom": path.join(BACKEND_NODE, "react-dom"),
      "react-router": path.join(BACKEND_NODE, "react-router"),
      "react-router-dom": path.join(BACKEND_NODE, "react-router-dom"),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },

  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: path.resolve(BACKEND_ROOT, "coverage"),
    },
  },

  projects: [
    // ---------- FRONTEND TESTS ----------
    defineProject({
      name: "web",
      plugins: [react()],
      test: {
        environment: "happy-dom",
        setupFiles: [path.join(FRONTEND_TESTS, "setup.js")],
        css: false,
        include: [
          // ✅ point here — your frontend/tests/requireauth.test.jsx lives here
          path.join(FRONTEND_TESTS, "**/*.test.{js,jsx,tsx}"),
        ],
        exclude: [
          // exclude backend unit tests (if any)
          path.join(BACKEND_ROOT, "tests/node/**"),
        ],
      },
    }),

    // ---------- BACKEND TESTS ----------
    defineProject({
      name: "node",
      test: {
        environment: "node",
        include: [path.join(BACKEND_ROOT, "tests/node/**/*.test.{js,ts}")],
        exclude: [path.join(FRONTEND_TESTS, "**/*.test.{js,jsx,tsx}")],
        testTimeout: 120_000,
      },
    }),
  ],
});

// backend/config/vitest.config.js
import { defineConfig, defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');
const BACKEND_NODE = path.resolve(__dirname, '../node_modules');

export default defineConfig({
  // ✅ ensure JSX is compiled with the automatic runtime
  // (so components don't need `import React from "react"`)
  plugins: [react()],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },

  resolve: {
    alias: {
      // allow absolute "/src/..." imports in frontend files
      '/src': FRONTEND_SRC,
      '@': FRONTEND_SRC,

      // 🔒 make React/ReactDOM a single instance for the whole graph
      react: path.join(BACKEND_NODE, 'react/index.js'),
      'react/jsx-runtime': path.join(BACKEND_NODE, 'react/jsx-runtime.js'),
      'react-dom': path.join(BACKEND_NODE, 'react-dom/index.js'),
      'react-dom/client': path.join(BACKEND_NODE, 'react-dom/client.js'),
    },
    dedupe: ['react', 'react-dom'],
  },

  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    globals: true,
  },

  // two projects: jsdom for React tests, node for API tests
  projects: [
    defineProject({
      test: {
        name: 'web',
        include: ['tests/**/*.test.{jsx,tsx}'],
        environment: 'jsdom',
        setupFiles: ['tests/setup.js'], // your JSDOM setup
      },
    }),
    defineProject({
      test: {
        name: 'node',
        include: ['tests/**/*.test.{js,ts}'],
        environment: 'node',
      },
    }),
  ],
});


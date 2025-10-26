// backend/config/vitest.config.js
import { defineConfig, defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');
const BACKEND_ROOT = path.resolve(__dirname, '..');
const TESTS_ROOT = path.resolve(BACKEND_ROOT, 'tests');
const BACKEND_NODE = path.resolve(BACKEND_ROOT, 'node_modules');

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },

  resolve: {
    alias: {
      // Frontend source aliases
      '/src': FRONTEND_SRC,
      '@': FRONTEND_SRC,

      // 🔒 Force a single instance of React & Router from backend/node_modules
      react: path.join(BACKEND_NODE, 'react'),
      'react/jsx-runtime': path.join(BACKEND_NODE, 'react/jsx-runtime.js'),
      'react-dom': path.join(BACKEND_NODE, 'react-dom'),
      'react-router': path.join(BACKEND_NODE, 'react-router'),
      'react-router-dom': path.join(BACKEND_NODE, 'react-router-dom'),
    },
    dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },

  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: path.resolve(BACKEND_ROOT, 'coverage'),
    },
  },

  projects: [
    // ---------- Frontend / DOM env ----------
    defineProject({
      name: 'web',
      plugins: [react()],
      test: {
        environment: 'happy-dom',               // or 'jsdom' if you prefer
        setupFiles: [path.join(TESTS_ROOT, 'setup.js')],
        css: false,

        // ⬇️ Pick ONE include style that matches your repo
        // If you keep tests in backend/tests/web/**
        // include: [path.join(TESTS_ROOT, 'web/**/*.test.{js,jsx,tsx}')],

        // If your tests are directly in backend/tests/**
        include: [path.join(TESTS_ROOT, '**/*.test.{js,jsx,tsx}')],

        // Keep backend tests out
        exclude: [path.join(TESTS_ROOT, 'node/**')],
      },
    }),

    // ---------- Backend / Node env ----------
    defineProject({
      name: 'node',
      test: {
        environment: 'node',
        include: [path.join(TESTS_ROOT, 'node/**/*.test.{js,ts}')],
        exclude: [path.join(TESTS_ROOT, '**/*.test.{jsx,tsx}')],
        testTimeout: 120_000, // mongodb-memory-server on CI
      },
    }),
  ],
});

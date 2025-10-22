import { defineConfig, defineProject } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');
const BACKEND_NODE = path.resolve(__dirname, '../node_modules');

export default defineConfig({
  plugins: [react()],
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },

  resolve: {
    alias: {
      '/src': FRONTEND_SRC,
      '@': FRONTEND_SRC,

      // 🔒 single React instance + explicit JSX runtimes
      react: path.join(BACKEND_NODE, 'react/index.js'),
      'react-dom': path.join(BACKEND_NODE, 'react-dom/index.js'),
      'react-dom/client': path.join(BACKEND_NODE, 'react-dom/client.js'),
      'react/jsx-runtime': path.join(BACKEND_NODE, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(BACKEND_NODE, 'react/jsx-dev-runtime.js'), // ← add this
    },
    dedupe: ['react', 'react-dom'],
  },

  test: {
    coverage: { provider: 'v8', reporter: ['text', 'lcov', 'html'], reportsDirectory: './coverage' },
    globals: true,
  },

  projects: [
    defineProject({
      test: {
        name: 'web',
        include: ['tests/**/*.test.{jsx,tsx}'],
        environment: 'jsdom',
        setupFiles: ['tests/setup.js'],
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

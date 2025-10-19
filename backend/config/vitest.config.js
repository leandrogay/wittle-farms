import { defineConfig } from "vitest/config";

export default defineConfig ({
    test: {
        include: ['tests/**/*.js'],
        environment: 'node',
        coverage: {
            reporter: ['text', 'lcov'],
            reportsDirectory: '/coverage'
        },
        globals: true
    }
});
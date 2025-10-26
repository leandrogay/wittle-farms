// backend/tests/setup.js
import { afterEach, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

// 1) Enable jest-dom matchers like toBeInTheDocument()
expect.extend(matchers);

// 2) Clean up the DOM after each test to avoid leakage
afterEach(() => {
  cleanup();
});

// 3) (Optional) Fake timers — but reset them after each test to avoid cross-test bleed
vi.useFakeTimers().setSystemTime(new Date("2025-10-15T12:00:00.000Z"));
afterEach(() => {
  vi.useRealTimers();
});

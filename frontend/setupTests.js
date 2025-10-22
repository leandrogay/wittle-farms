// Jest-DOM matchers for RTL:
import '@testing-library/jest-dom';

// Optional: stable time for date-based UI logic
import { vi } from 'vitest';
vi.useFakeTimers().setSystemTime(new Date('2025-10-15T12:00:00.000Z'));

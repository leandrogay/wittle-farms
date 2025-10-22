import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Optional but helpful for deterministic date-based UI:
vi.useFakeTimers().setSystemTime(new Date('2025-10-15T12:00:00.000Z'));

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { resetRateLimitBuckets } from '../artifacts/api-server/src/lib/rateLimit';

afterEach(() => {
  resetRateLimitBuckets();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

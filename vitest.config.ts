import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'artifacts/xrpl-flow/src'),
      '@workspace/api-zod': path.resolve(import.meta.dirname, 'lib/api-zod/src/index.ts'),
      '@workspace/db': path.resolve(import.meta.dirname, 'lib/db/src/index.ts'),
      '@workspace/api-client-react': path.resolve(import.meta.dirname, 'lib/api-client-react/src/index.ts'),
      '@xyflow/react': path.resolve(import.meta.dirname, 'artifacts/xrpl-flow/node_modules/@xyflow/react'),
      jsep: path.resolve(import.meta.dirname, 'artifacts/xrpl-flow/node_modules/jsep'),
      xrpl: path.resolve(import.meta.dirname, 'artifacts/xrpl-flow/node_modules/xrpl'),
      zod: path.resolve(import.meta.dirname, 'artifacts/xrpl-flow/node_modules/zod'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build', 'tests/e2e/**', 'tests/smoke/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'coverage/**',
        'dist/**',
        'node_modules/**',
        'tests/**',
        '**/*.config.*',
        '**/components/ui/**',
        'artifacts/mockup-sandbox/**',
      ],
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['tests/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
});

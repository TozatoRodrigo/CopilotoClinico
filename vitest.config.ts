import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/main.ts',
        'src/**/index.ts',
        // Workers e providers são testados via integração, não unit
        'src/workers/**',
      ],
      // OPS-002: thresholds enforçados no CI via pnpm test:cov
      // Progressão planejada: R1=70% → R2=80% → Prod=85%
      // Subir conforme cobertura de novos módulos cresce.
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});

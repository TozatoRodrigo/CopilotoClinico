import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['tests/integration/**/*.integration-spec.ts'],
    testTimeout: 60000,
    // Testes de integração rodam sequencialmente para evitar
    // conflitos em transações de banco compartilhado
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});

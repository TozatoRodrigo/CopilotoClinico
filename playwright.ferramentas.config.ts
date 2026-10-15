import { defineConfig, devices } from '@playwright/test';

/**
 * CC-322 — Ferramentas offline, sem a API nem o banco (o playwright.config.ts
 * principal sobe os dois). Só o web, já construído com as Ferramentas ligadas:
 *
 *   cd web && NEXT_PUBLIC_FERRAMENTAS=on NEXT_PUBLIC_API_URL=http://localhost:3000/v1 pnpm build
 *   pnpm exec playwright test -c playwright.ferramentas.config.ts
 */
const WEB_PORT = process.env.E2E_FERRAMENTAS_PORT ?? '3002';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'ferramentas-offline.spec.ts',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next start -p ${WEB_PORT}`,
    cwd: 'web',
    url: `http://localhost:${WEB_PORT}/manifest.json`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});

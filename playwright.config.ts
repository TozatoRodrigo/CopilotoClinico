import { defineConfig, devices } from '@playwright/test';

/**
 * F4 — Playwright E2E por perfil (médico / compliance / admin).
 *
 * Boots the real backend (AI_PROVIDER=test → deterministic) and the Next.js web,
 * then drives browser flows against the seeded roles (scripts/seed-e2e-users.ts).
 *
 * Local:  docker compose -f docker/docker-compose.yml up -d
 *         pnpm prisma migrate deploy && pnpm seed:e2e
 *         pnpm build && (cd web && pnpm build)   # sobe dist/main e next start
 *         pnpm exec playwright test
 * CI:     see the e2e-ui job in .github/workflows/e2e.yml.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '3001';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared seeded state (one pending CRM) — run serially
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [
    // Loga cada perfil uma vez e salva a sessão (e2e/auth.setup.ts).
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
  // `webServer` aceita uma lista (API + web). A chave `webServers` não existe
  // no Playwright: era ignorada em silêncio, nenhum servidor subia e a suíte
  // inteira caía em ERR_CONNECTION_REFUSED.
  webServer: [
    {
      command: 'node dist/main',
      cwd: '.',
      url: `${API_URL.replace(/\/v1$/, '')}/v1/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        AI_PROVIDER: 'test',
        AI_API_KEY: 'dummy',
        // O WhisperService exige a chave no boot; a suíte não transcreve áudio.
        WHISPER_API_KEY: 'dummy',
        // ADR-014 — Copiloto guiado ligado: a leitura determinística pergunta
        // só com o sentinel [incompleto]; os outros casos seguem direto ao plano.
        COPILOT_INTAKE: 'on',
      },
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      cwd: 'web',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
      },
    },
  ],
});

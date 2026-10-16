import path from 'node:path';
import { expect, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

/**
 * Shared credentials provisioned by scripts/seed-e2e-users.ts.
 */
export const E2E = {
  password: 'Copiloto@E2E123',
  medico: 'medico@copiloto.test',
  compliance: 'compliance@copiloto.test',
  admin: 'admin@copiloto.test',
} as const;

export type E2ERole = 'medico' | 'compliance' | 'admin';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

/**
 * Sessão salva de cada perfil (e2e/auth.setup.ts). O /auth/login aceita 5
 * tentativas por minuto por IP; com um login por teste, a suíte levava 429 a
 * partir do sexto teste. Cada perfil entra uma vez e os testes reaproveitam.
 */
export function storageStatePath(role: E2ERole): string {
  return path.join(__dirname, '..', 'playwright', '.auth', `${role}.json`);
}

/**
 * Logs in through the real /login UI so the app sets all auth state
 * (httpOnly tokens + the auth_physician cookie/localStorage the middleware reads).
 */
export async function loginAs(page: Page, email: string, password = E2E.password): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  // Dashboard is the post-login landing for every role.
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 20_000 });
}

/**
 * Cadastra um médico descartável num contexto HTTP anônimo. O /auth/register
 * devolve os cookies de sessão do recém-cadastrado: feito pelo `page.request`,
 * eles trocariam a sessão do admin pela do novo PHYSICIAN e o reset seguinte
 * levaria 403.
 */
export async function registerThrowawayPhysician(
  playwright: PlaywrightWorkerArgs['playwright'],
  emailPrefix: string,
  name: string,
): Promise<{ id: string }> {
  const anonymous = await playwright.request.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const unique = Date.now();
    const res = await anonymous.post(`${API_URL}/auth/register`, {
      data: {
        email: `${emailPrefix}-${unique}@e2e.test`,
        password: E2E.password,
        crmUf: 'SP',
        crmNumber: `E2E${unique}`,
        name,
      },
    });
    expect(res.ok()).toBeTruthy();
    const { physician } = (await res.json()) as { physician: { id: string } };
    return physician;
  } finally {
    await anonymous.dispose();
  }
}

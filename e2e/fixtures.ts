import type { Page } from '@playwright/test';

/**
 * Shared credentials provisioned by scripts/seed-e2e-users.ts.
 */
export const E2E = {
  password: 'Copiloto@E2E123',
  medico: 'medico@copiloto.test',
  compliance: 'compliance@copiloto.test',
  admin: 'admin@copiloto.test',
} as const;

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/v1';

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

import { test, expect } from '@playwright/test';
import { loginAs, E2E, API_URL } from './fixtures';

test.describe('Perfil admin — reset de MFA (RBAC)', () => {
  test('admin reseta o MFA de um usuário via JWT (204)', async ({ page }) => {
    await loginAs(page, E2E.admin);

    // Provisiona um usuário alvo (register sempre cria PHYSICIAN).
    const email = `throwaway-${Date.now()}@e2e.test`;
    const registerRes = await page.request.post(`${API_URL}/auth/register`, {
      data: {
        email,
        password: E2E.password,
        crmUf: 'SP',
        crmNumber: `E2E${Date.now()}`,
        name: 'Throwaway E2E',
      },
    });
    expect(registerRes.ok()).toBeTruthy();
    const { physician } = await registerRes.json();

    // Admin (sessão JWT) resetando o MFA do alvo → 204.
    const reset = await page.request.post(
      `${API_URL}/auth/admin/users/${physician.id}/mfa-reset`,
    );
    expect(reset.status()).toBe(204);
  });

  test('médico (PHYSICIAN) não pode resetar MFA — 403', async ({ page }) => {
    await loginAs(page, E2E.medico);

    const res = await page.request.post(
      `${API_URL}/auth/admin/users/00000000-0000-0000-0000-000000000000/mfa-reset`,
    );
    expect(res.status()).toBe(403);
  });
});

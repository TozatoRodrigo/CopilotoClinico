import { test, expect } from '@playwright/test';
import { API_URL, registerThrowawayPhysician, storageStatePath } from './fixtures';

test.describe('Perfil admin — reset de MFA (RBAC)', () => {
  test.describe('como admin', () => {
    test.use({ storageState: storageStatePath('admin') });

    test('admin reseta o MFA de um usuário via JWT (204)', async ({ page, playwright }) => {
      // Provisiona um usuário alvo (register sempre cria PHYSICIAN).
      const physician = await registerThrowawayPhysician(playwright, 'throwaway', 'Throwaway E2E');

      // Admin (sessão JWT) resetando o MFA do alvo → 204.
      const reset = await page.request.post(
        `${API_URL}/auth/admin/users/${physician.id}/mfa-reset`,
      );
      expect(reset.status()).toBe(204);
    });

    test('admin desativa o MFA de todo mundo que estava usando (200)', async ({
      page,
      playwright,
    }) => {
      // Provisiona um usuário alvo sem MFA: o bulk reset só pega quem está
      // "usando", não quem apenas existe.
      const physician = await registerThrowawayPhysician(
        playwright,
        'throwaway-bulk',
        'Throwaway Bulk E2E',
      );

      const bulkReset = await page.request.post(`${API_URL}/auth/admin/users/mfa-reset-all`);
      expect(bulkReset.status()).toBe(200);
      const body = await bulkReset.json();
      expect(typeof body.count).toBe('number');
      expect(Array.isArray(body.physicianIds)).toBe(true);

      // Alvo que nunca tinha ativado MFA não deveria aparecer na lista afetada.
      expect(body.physicianIds).not.toContain(physician.id);
    });
  });

  test.describe('como médico', () => {
    test.use({ storageState: storageStatePath('medico') });

    test('médico (PHYSICIAN) não pode resetar MFA — 403', async ({ page }) => {
      const res = await page.request.post(
        `${API_URL}/auth/admin/users/00000000-0000-0000-0000-000000000000/mfa-reset`,
      );
      expect(res.status()).toBe(403);
    });

    test('médico (PHYSICIAN) não pode disparar o reset em massa — 403', async ({ page }) => {
      const res = await page.request.post(`${API_URL}/auth/admin/users/mfa-reset-all`);
      expect(res.status()).toBe(403);
    });
  });
});

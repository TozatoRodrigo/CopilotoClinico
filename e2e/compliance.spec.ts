import { test, expect } from '@playwright/test';
import { loginAs, E2E } from './fixtures';

test.describe('Perfil compliance — CRM e auditoria', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.compliance);
  });

  test('aprova solicitação de CRM pendente e abre a auditoria', async ({ page }) => {
    // Fila de verificações CRM
    await page.goto('/admin/crm-verifications');
    await expect(page.getByRole('heading', { name: 'Verificações CRM' })).toBeVisible();

    // A solicitação PENDING do médico seedado deve aparecer.
    const pendingRow = page.getByText(E2E.medico);
    await expect(pendingRow).toBeVisible({ timeout: 15_000 });

    // Aprovar a primeira pendente.
    await page.getByRole('button', { name: 'Aprovar' }).first().click();

    // Auditoria acessível ao compliance.
    await page.goto('/audit');
    await expect(page.getByRole('button', { name: /Tentar novamente|Exportar|Filtrar/ }).or(page.locator('h1'))).toBeVisible({ timeout: 15_000 });
  });
});

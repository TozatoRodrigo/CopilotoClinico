import { test, expect } from '@playwright/test';
import { loginAs, E2E } from './fixtures';

test.describe('Perfil médico — loop de decisão e confirmação', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E.medico);
  });

  test('cadastro → análise → geração e confirmação de documento', async ({ page }) => {
    // Novo atendimento
    await page.goto('/encounters/new');
    await page.locator('#patientRef').fill('E2E-CONFIRMA-001');
    await page.getByRole('button', { name: 'Criar e capturar' }).click();

    // Captura + análise (provider determinístico → conduta definitiva)
    await page.waitForURL(/\/encounters\/[^/]+\/capture/);
    await page.getByLabel('Descrição do caso clínico').fill('Paciente com síndrome gripal, afebril, sem comorbidades.');
    await page.getByRole('button', { name: 'Analisar com Copiloto' }).click();
    await page.waitForURL(/\/encounters\/[^/]+\/result/);

    // Gerar documento SOAP
    await expect(page.getByText('Gerar documento')).toBeVisible();
    await page.getByRole('button', { name: 'SOAP' }).click();
    await page.waitForURL(/\/documents\/[^/]+\/edit/);

    // Confirmar (dialog "Assumir este documento")
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByRole('button', { name: 'Assumir este documento' }).click();

    // Selo de conduta confirmada e assinada
    await expect(page.getByText('Conduta confirmada e assinada')).toBeVisible({ timeout: 20_000 });
  });

  test('loop de decisão com incerteza emite pergunta bloqueadora', async ({ page }) => {
    await page.goto('/encounters/new');
    await page.locator('#patientRef').fill('E2E-INCERTEZA-001');
    await page.getByRole('button', { name: 'Criar e capturar' }).click();

    await page.waitForURL(/\/encounters\/[^/]+\/capture/);
    // O sentinel [uncertain] aciona a saída determinística com incerteza + blocker.
    await page.getByLabel('Descrição do caso clínico').fill('Quadro atípico sem dados suficientes [uncertain] para fechar conduta.');
    await page.getByRole('button', { name: 'Analisar com Copiloto' }).click();
    await page.waitForURL(/\/encounters\/[^/]+\/result/);

    await expect(page.getByText('Perguntas do copiloto')).toBeVisible({ timeout: 20_000 });
  });

  test('fila offline enfileira a análise quando sem conexão', async ({ page, context }) => {
    await page.goto('/encounters/new');
    await page.locator('#patientRef').fill('E2E-OFFLINE-001');
    await page.getByRole('button', { name: 'Criar e capturar' }).click();
    await page.waitForURL(/\/encounters\/[^/]+\/capture/);

    await page.getByLabel('Descrição do caso clínico').fill('Caso para validar o enfileiramento offline do copiloto.');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Analisar com Copiloto' }).click();

    await expect(page.getByText(/Sem conexão/)).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });
});

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

    // Conversa do caso (provider determinístico → caso completo, conduta definitiva)
    await page.waitForURL(/\/encounters\/[^/]+\/conversation/);
    await page.getByLabel('Descrição do caso clínico').fill('Paciente com síndrome gripal, afebril, sem comorbidades.');
    await page.getByRole('button', { name: 'Enviar caso' }).click();

    // O plano sai na própria conversa; gerar documento SOAP
    await expect(page.getByText('Gerar documento')).toBeVisible({ timeout: 20_000 });
    // O documento abre em nova aba, para o médico não perder a conversa.
    const [documentPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'SOAP' }).click(),
    ]);
    await documentPage.waitForURL(/\/documents\/[^/]+\/edit/);

    // Confirmar (dialog "Assumir este documento")
    await documentPage.getByRole('button', { name: 'Confirmar' }).click();
    await documentPage.getByRole('button', { name: 'Assumir este documento' }).click();

    // Selo de conduta confirmada e assinada
    await expect(documentPage.getByText('Conduta confirmada e assinada')).toBeVisible({
      timeout: 20_000,
    });
  });

  test('pergunta do plano, uma por vez, refaz o plano com a resposta', async ({ page }) => {
    await page.goto('/encounters/new');
    await page.locator('#patientRef').fill('E2E-INCERTEZA-001');
    await page.getByRole('button', { name: 'Criar e capturar' }).click();

    await page.waitForURL(/\/encounters\/[^/]+\/conversation/);
    // O sentinel [uncertain] aciona a saída determinística com incerteza + blocker.
    await page.getByLabel('Descrição do caso clínico').fill('Quadro atípico sem dados suficientes [uncertain] para fechar conduta.');
    await page.getByRole('button', { name: 'Enviar caso' }).click();

    await expect(page.getByText(/Para fechar o plano, 1 pergunta/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Não', exact: true }).click();

    // A resposta gera a rodada 2 do plano na mesma conversa.
    await expect(page.getByText('Rodada 2 de 5')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Plano anterior · rodada 1')).toBeVisible();
  });

  test('Copiloto guiado pergunta antes do plano, uma coisa por vez', async ({ page }) => {
    await page.goto('/encounters/new');
    await page.locator('#patientRef').fill('E2E-GUIADO-001');
    await page.getByRole('button', { name: 'Criar e capturar' }).click();

    await page.waitForURL(/\/encounters\/[^/]+\/conversation/);
    // O sentinel [incompleto] faz a leitura do caso pedir 2 dados (COPILOT_INTAKE=on).
    await page.getByLabel('Descrição do caso clínico').fill('Mulher, 34 anos, cefaleia forte desde ontem. [incompleto]');
    await page.getByRole('button', { name: 'Enviar caso' }).click();

    await expect(page.getByText('Antes do plano, 2 perguntas rápidas que mudam a conduta.')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Pergunta 1 de 2')).toBeVisible();
    await page.getByRole('button', { name: 'Não', exact: true }).click();

    await expect(page.getByText('Pergunta 2 de 2')).toBeVisible();
    await page.getByRole('button', { name: 'Não tenho agora' }).click();

    // A última resposta começa o plano sozinha, na mesma conversa.
    await expect(page.getByText('Obrigado. Montando o plano com o que você me contou.')).toBeVisible();
    await expect(page.getByText('Gerar documento')).toBeVisible({ timeout: 20_000 });
  });

  test('fila offline enfileira a análise quando sem conexão', async ({ page, context }) => {
    await page.goto('/encounters/new');
    await page.locator('#patientRef').fill('E2E-OFFLINE-001');
    await page.getByRole('button', { name: 'Criar e capturar' }).click();
    await page.waitForURL(/\/encounters\/[^/]+\/conversation/);

    await page.getByLabel('Descrição do caso clínico').fill('Caso para validar o enfileiramento offline do copiloto.');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Enviar caso' }).click();

    // Banner global, aviso da página e toast mencionam "Sem conexão".
    await expect(page.getByText(/Sem conexão/).first()).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
  });
});

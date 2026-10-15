import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * CC-322 — Ferramentas sem sinal. Abre o app uma vez com sinal, espera o
 * service worker guardar as Ferramentas no aparelho, corta a rede e confere
 * que ACLS, Pediatria, Infusões e Calculadoras abrem e calculam, com o aviso
 * de sem conexão e a versão do conteúdo no rodapé.
 *
 * Não precisa da API: a sessão é simulada (cookie que o middleware confere e
 * o médico no localStorage, como depois do login), e as Ferramentas não
 * chamam o servidor. Precisa de um build do web com
 * `NEXT_PUBLIC_FERRAMENTAS=on`; sem a flag, /ferramentas é 404 e o teste é
 * pulado. Rodar sozinho: `pnpm exec playwright test -c playwright.ferramentas.config.ts`.
 */

const MANIFEST = join(__dirname, '..', 'web', 'public', 'ferramentas-offline.json');

const PHYSICIAN = {
  id: 'e2e-ferramentas',
  name: 'Dra. Teste Offline',
  email: 'offline@copiloto.test',
  crmUf: 'SP',
  crmNumber: '000000',
  crmVerified: true,
  role: 'PHYSICIAN',
};

async function signIn(context: BrowserContext, baseURL: string) {
  const physician = encodeURIComponent(JSON.stringify(PHYSICIAN));
  await context.addCookies([
    { name: 'access_token', value: 'e2e-ferramentas-offline', url: baseURL },
    { name: 'auth_physician', value: physician, url: baseURL },
  ]);
  await context.addInitScript((value) => {
    window.localStorage.setItem('auth_physician', value);
  }, JSON.stringify(PHYSICIAN));
}

async function waitForOfflineReady(page: Page) {
  await expect(page.locator('[data-slot="tools-offline-footer"]')).toContainText(
    'Disponível sem conexão',
    { timeout: 90_000 },
  );
}

test.describe('Ferramentas sem conexão (CC-322)', () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    await signIn(context, baseURL ?? 'http://localhost:3002');
    const response = await page.goto('/ferramentas');
    test.skip(response?.status() === 404, 'build sem NEXT_PUBLIC_FERRAMENTAS=on');
  });

  test('ACLS, Pediatria, Infusões e Calculadoras abrem e calculam sem sinal', async ({
    context,
    page,
  }) => {
    await waitForOfflineReady(page);
    const version = await page.locator('[data-slot="tools-offline-footer"]').innerText();

    await context.setOffline(true);

    // ACLS: abre e inicia o código.
    await page.goto('/ferramentas/acls');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Parada cardiorrespiratória (ACLS)' }),
    ).toBeVisible();
    await expect(
      page.getByText('Sem conexão: ferramentas funcionam, análise do caso fica na fila.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar código' }).click();
    await expect(page.getByRole('button', { name: /^Chocável/ })).toBeVisible();

    // Pediatria: peso → energia da desfibrilação (2 J/kg × 20 kg).
    await page.goto('/ferramentas/pediatria');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Emergência pediátrica' }),
    ).toBeVisible();
    await page.getByRole('textbox', { name: 'Peso (kg)' }).fill('20');
    const pcr = page.getByRole('region', { name: 'PCR pediátrica' });
    await expect(pcr.getByText('40 J', { exact: true })).toBeVisible();

    // Infusões: a droga pelo endereço e a conta dose → mL/h.
    await page.goto('/ferramentas/infusoes?droga=noradrenalina');
    await expect(page.getByRole('heading', { level: 1, name: 'Noradrenalina' })).toBeVisible();
    await page.getByLabel(/^Peso/).fill('70');
    await page.getByLabel(/^Dose \(/).fill('0,1');
    await expect(page.getByLabel(/^Velocidade/)).not.toHaveValue('');

    // Calculadoras: CURB-65 com resultado ao vivo.
    await page.goto('/ferramentas/calculadoras/curb65');
    await expect(page.getByRole('heading', { level: 1, name: /CURB-65/ })).toBeVisible();
    await page
      .getByRole('group', { name: /^Confusão/ })
      .getByRole('radio', { name: /^Sim/ })
      .check();
    for (const item of [/^Ureia/, /^Frequência respiratória/, /^Pressão arterial/, /^Idade/]) {
      await page.getByRole('group', { name: item }).getByRole('radio', { name: /^Não/ }).check();
    }
    await expect(page.getByRole('status').filter({ hasText: /1 ponto/ })).toBeVisible();

    // A versão guardada aparece no rodapé, sem sinal.
    await expect(page.locator('[data-slot="tools-offline-footer"]')).toHaveText(version);

    await context.setOffline(false);
  });

  test('ao voltar o sinal, baixa a versão nova do conteúdo e mostra no rodapé', async ({
    context,
    page,
  }) => {
    await waitForOfflineReady(page);
    await context.setOffline(true);
    await page.goto('/ferramentas/infusoes');
    await expect(page.getByRole('heading', { level: 1, name: 'Infusões contínuas' })).toBeVisible();

    // Deploy de conteúdo novo enquanto o médico está sem sinal.
    const original = readFileSync(MANIFEST, 'utf-8');
    const manifest = JSON.parse(original) as { version: string };
    writeFileSync(MANIFEST, JSON.stringify({ ...manifest, version: 'e2e-nova-versao' }));
    try {
      await context.setOffline(false);
      const footer = page.locator('[data-slot="tools-offline-footer"]');
      await expect(footer).toContainText('versão do conteúdo e2e-nova-versao', { timeout: 90_000 });
      await expect(footer.getByRole('button', { name: /Conteúdo atualizado/ })).toBeVisible();

      // E a versão nova continua valendo sem sinal.
      await context.setOffline(true);
      await page.goto('/ferramentas/acls');
      await expect(footer).toContainText('versão do conteúdo e2e-nova-versao');
    } finally {
      writeFileSync(MANIFEST, original);
      await context.setOffline(false);
    }
  });
});

import { test as setup } from '@playwright/test';
import { E2E, loginAs, storageStatePath, type E2ERole } from './fixtures';

// Um login por perfil, pela tela real de /login, antes das suítes. Os testes
// abrem já autenticados com a sessão salva (ver storageStatePath).
const ROLES: readonly E2ERole[] = ['medico', 'compliance', 'admin'];

for (const role of ROLES) {
  setup(`login como ${role}`, async ({ page }) => {
    await loginAs(page, E2E[role]);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}

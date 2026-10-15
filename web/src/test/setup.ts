import '@testing-library/jest-dom';
import { afterEach } from 'vitest';

// As Ferramentas guardam o estado de tela na sessão da aba (tool-session.ts):
// sem limpar, as respostas de um teste apareceriam no seguinte.
afterEach(() => {
  window.sessionStorage.clear();
});

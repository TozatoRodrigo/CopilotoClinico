import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../../config/feature-flag';

/**
 * CC-707 — `COPILOT_MENTORING`: liga "Discutir com um médico da equipe".
 * Desligada (padrão), nenhuma rota da mentoria responde (404) e a tela não
 * mostra nada. Lida a cada chamada, para desligar sem redeploy; typo = off.
 */
export function isMentoringEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, 'COPILOT_MENTORING', false);
}

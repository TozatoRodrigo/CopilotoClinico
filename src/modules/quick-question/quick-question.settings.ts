import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../../config/feature-flag';

/**
 * CC-501 — pergunta rápida no Plantão. Desligada por padrão: o campo não
 * aparece na tela e `POST /quick-questions` responde 404. Lida a cada
 * chamada, sem redeploy; valor irreconhecível = desligada.
 *
 * Ligar exige cartões publicados e o índice com vetor (`pnpm cards:reindex`
 * com um provedor de embedding ligado): sem busca, toda pergunta volta
 * "busca indisponível".
 */
export const QUICK_QUESTION_FLAG = 'COPILOT_QUICK_QUESTION';

export function isQuickQuestionEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, QUICK_QUESTION_FLAG, false);
}

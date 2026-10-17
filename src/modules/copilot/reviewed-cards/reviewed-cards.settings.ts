import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../../../config/feature-flag';

/**
 * CC-408 — cartões revisados na decisão em etapas (v2, v3, v4). Desligada
 * por padrão: com ela desligada, nenhuma busca de cartão roda e o prompt e a
 * saída da decisão ficam byte a byte iguais aos de antes dos cartões. Lida a
 * cada turno, sem redeploy; valor irreconhecível = desligada.
 *
 * Ligar exige cartões publicados, o índice com vetor (`pnpm cards:reindex`
 * com um provedor de embedding ligado) e o gabarito sem aumento de erro
 * crítico (critério 3 da CC-408).
 */
export const REVIEWED_CARDS_FLAG = 'COPILOT_REVIEWED_CARDS';

export function isReviewedCardsEnabled(config: ConfigService): boolean {
  return readBooleanFlag(config, REVIEWED_CARDS_FLAG, false);
}
